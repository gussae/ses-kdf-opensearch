/**
 *  domain created either in VPC or outside: tested for outside
 *  FineGrainedAccessControl (FGAC) is supported: tested for FGAC
 *  roles must be mapped to the internal DB roles : read https://docs.aws.amazon.com/opensearch-service/latest/developerguide/fgac.html#fgac-concepts
 *  create roles as well as masterUser and password on console (the setup here just do enough to provision the domain)
 */
import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Domain, DomainProps } from 'aws-cdk-lib/aws-opensearchservice';
import { CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose';
import { SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { getOpensearchVersion, getSubnetType } from './helpers';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import {
  CfnConfigurationSet,
  CfnConfigurationSetEventDestination,
} from 'aws-cdk-lib/aws-ses';
import {
  enableCloudWatchLogging as ENABLE_CLOUDWATCH_LOGGING,
  enableFineGrainedAccess as ENABLE_FINE_GRAINED_ACCESS,
  enableVpc as ENABLE_VPC,
  deliveryStreamS3BackupMode as DELIVERY_STREAM_S3_BACKUP_MODE,
  ebsOptions as EBS__OPTIONS,
  indexRotationPeriod as INDEX_ROTATION_PERIOD,
  loggingOptions as LOGGING__OPTIONS,
  opensearchCapacity as OPENSEARCH__CAPACITY,
  opensearchVersion as OPENSEARCH__VERSION,
  sesMatchingEventTypes as SES_MATCHING_EVENT_TYPES,
  subnet as SUBNET,
  vpcName as VPC__NAME,
  zoneAwareness as ZONE__AWARENESS,
} from '../default-settings.json';
import {
  AnyPrincipal,
  CfnServiceLinkedRole,
  Effect,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
export interface SesKdfOpensearchProps
  extends StackProps,
    Omit<
      CfnDeliveryStream.AmazonopensearchserviceDestinationConfigurationProperty,
      | 'cloudWatchLoggingOptions'
      | 'clusterEndpoint'
      | 'roleArn'
      | 's3Configuration'
    >,
    Omit<
      DomainProps,
      'fineGrainedAccessControl' | 'version' | 'vpc' | 'vpcSubnets'
    > {
  appName: string;
  deliveryStreamType?: 'DirectPut' | 'KinesisStreamAsSource';
  enableFineGrainedAccessControl?: boolean;
  subnet?: SubnetType | undefined;
  version?: string | undefined;
  vpcName?: string | undefined;
}

export class SesKdfOpensearchStack extends Stack {
  constructor(scope: Construct, id: string, props: SesKdfOpensearchProps) {
    super(scope, id, props);

    //names have to be lowercase only + only name resources when required => just name outputs only if possible
    let appName = props.appName;

    //output names
    let sesConfigSetOutputName = `${appName}-ses-config-set`;
    let opensearchDomainName = `${appName}-opensearch-domain`;
    let kdfOpensearchAccessRoleName = `${appName}-kdf-opensearch-access`;
    let vpc = ENABLE_VPC
      ? Vpc.fromLookup(this, 'Vpc', { vpcName: props.vpcName ?? VPC__NAME })
      : undefined;

    // use internal DB  for fine-grained access control : password and user name are logged to the console
    const masterUserName = ENABLE_FINE_GRAINED_ACCESS
      ? `${appName}-master-user`
      : undefined;

    //s3 bucket configuration is needed for the kdf delivery stream
    let kdfBucket = new Bucket(this, 'KdfBucket', {});

    //access role to be assumed by KDF to access opensearch
    const kdfOpensearchAccessRole = new Role(this, 'KdfOpensearchAccessRole', {
      assumedBy: new ServicePrincipal('firehose.amazonaws.com'),
    });

    //?NOTE the following policy can be further restricted by breaking the policy statements into multiple ones by VPC and Non-VPC setups, encrypted or not,  etc, as well as using more granular resources per S3 bucket, VPC, kinesis stream etc. but note that this is assumed by KDF, the service and relatively safe and not by the user + the work is deemed tedious for a short project to parse through the CDK deploy props and determine the right policy to use for a low priority concern. If you lik to work on it, please read  https://docs.aws.amazon.com/firehose/latest/dev/controlling-access.html#using-iam-es

    kdfOpensearchAccessRole.addToPolicy(
      new PolicyStatement({
        actions: [
          //opensearch actions
          'es:ESHttpPost',
          'es:ESHttpPut*',
          'es:ESHttpGet*',
          'es:DescribeElasticsearchDomain',
          'es:DescribeElasticsearchDomains',
          'es:DescribeElasticsearchDomainConfig',
          //for vpc access
          'ec2:DescribeVpcs',
          'ec2:DescribeVpcAttribute',
          'ec2:DescribeSubnets',
          'ec2:DescribeSecurityGroups',
          'ec2:DescribeNetworkInterfaces',
          'ec2:CreateNetworkInterface',
          'ec2:CreateNetworkInterfacePermission',
          'ec2:DeleteNetworkInterface',
          //CWL logs
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          //encryption
          'kms:Decrypt',
          'kms:GenerateDataKey',
          //it uses lambda to insert data into the domain (s3->opensearch)
          'lambda:InvokeFunction',
          'lambda:GetFunctionConfiguration',
          //if connected with kinesis stream as source
          'kinesis:DescribeStream',
          'kinesis:GetShardIterator',
          'kinesis:GetRecords',
          'kinesis:ListShards',
          //s3 access provided by kdfBucket.grantReadWrite(kdfOpensearchAccessRole)
        ],
        effect: Effect.ALLOW,
        resources: ['*'],
      })
    );

    //grant kdf access to the s3 bucket
    kdfBucket.grantReadWrite(kdfOpensearchAccessRole);

    //opensearch domain
    const opensearchDomain = new Domain(this, 'OpensearchDomain', {
      domainName: `${opensearchDomainName}`,
      accessPolicies: [
        new PolicyStatement({
          actions: ['es:ESHttp*'],
          effect: Effect.ALLOW,
          //!this assumes access over https dashboard using FGAC
          principals: [new AnyPrincipal()],
          resources: [
            `arn:aws:es:${this.region}:${this.account}:domain/${opensearchDomainName}/*`,
          ],
        }),
      ],
      capacity:
        {
          dataNodeInstanceType:
            props.capacity?.dataNodeInstanceType ??
            OPENSEARCH__CAPACITY.dataNodeInstanceType,
          dataNodes:
            props.capacity?.dataNodes ?? OPENSEARCH__CAPACITY.dataNodes,
          masterNodeInstanceType: props.capacity?.masterNodeInstanceType,
          masterNodes:
            props.capacity?.masterNodes ?? OPENSEARCH__CAPACITY.masterNodes,
          warmInstanceType: props.capacity?.warmInstanceType,
          warmNodes:
            props.capacity?.warmNodes ?? OPENSEARCH__CAPACITY.warmNodes,
        } ?? OPENSEARCH__CAPACITY,
      ebs:
        {
          enabled: props.ebs?.enabled ?? EBS__OPTIONS.enabled,
          volumeSize: props.ebs?.volumeSize ?? EBS__OPTIONS.volumeSize,
        } ?? EBS__OPTIONS,
      enforceHttps: true,
      encryptionAtRest: { enabled: true },
      fineGrainedAccessControl: ENABLE_FINE_GRAINED_ACCESS
        ? {
            masterUserName, //set password over console
          }
        : undefined,
      logging:
        {
          appLogEnabled:
            props.logging?.appLogEnabled ?? LOGGING__OPTIONS.appLogEnabled,
          slowIndexLogEnabled:
            props.logging?.slowIndexLogEnabled ??
            LOGGING__OPTIONS.slowIndexLogEnabled,
          slowSearchLogEnabled:
            props.logging?.slowSearchLogEnabled ??
            LOGGING__OPTIONS.slowSearchLogEnabled,
        } ?? LOGGING__OPTIONS,
      nodeToNodeEncryption: true,
      version: getOpensearchVersion(props.version ?? OPENSEARCH__VERSION),
      vpc,
      vpcSubnets: vpc
        ? [
            {
              subnetType: getSubnetType(props?.subnet ?? SUBNET),
            },
          ]
        : undefined,
      zoneAwareness: props.zoneAwareness ?? ZONE__AWARENESS,
    });

    //service role for opensearch to access VPC resources
    const opensearchSlr = new CfnServiceLinkedRole(this, 'ServiceLinkedRole', {
      awsServiceName: 'es.amazonaws.com',
    });
    opensearchDomain.node.addDependency(opensearchSlr);
    opensearchDomain.grantWrite(kdfOpensearchAccessRole); //?redundant

    //kdf delivery stream: depends on domain name
    const deliveryStream = new CfnDeliveryStream(this, 'KdfDeliveryStream', {
      deliveryStreamType: props.deliveryStreamType ?? 'DirectPut',
      amazonopensearchserviceDestinationConfiguration: {
        cloudWatchLoggingOptions: ENABLE_CLOUDWATCH_LOGGING
          ? {
              enabled: true,
              logGroupName: `${appName}/kdf-opensearch-delivery-stream`,
              logStreamName: `${appName}-delivery-stream`,
            }
          : undefined,
        domainArn: opensearchDomain.domainArn,
        indexName: props.indexName,
        indexRotationPeriod: props.indexRotationPeriod ?? INDEX_ROTATION_PERIOD,
        roleArn: kdfOpensearchAccessRole.roleArn,
        s3BackupMode: props.s3BackupMode ?? DELIVERY_STREAM_S3_BACKUP_MODE,
        s3Configuration: {
          bucketArn: kdfBucket.bucketArn,
          roleArn: kdfOpensearchAccessRole.roleArn,
        },
        vpcConfiguration: vpc
          ? {
              roleArn: kdfOpensearchAccessRole.roleArn,
              securityGroupIds: [
                opensearchDomain.connections.securityGroups[0].securityGroupId, //assumes u are using CDK default SG
              ],
              subnetIds: vpc.selectSubnets({
                subnetType: getSubnetType(props?.subnet ?? SUBNET),
              }).subnetIds,
            }
          : undefined,
      },
    });
    //the ff maybe redundant but ensure dependencies
    deliveryStream.node.addDependency(
      opensearchDomain,
      kdfOpensearchAccessRole,
      kdfBucket
    );

    //ses
    const configSet = new CfnConfigurationSet(this, 'SesConfigSet', {});

    const sesFirehoseAccess = new Role(this, 'SesFirehoseAccess', {
      assumedBy: new ServicePrincipal('ses.amazonaws.com'),
    });
    sesFirehoseAccess.addToPolicy(
      new PolicyStatement({
        actions: ['firehose:*'],//!PutRecordBatch fails => blunt force for now
        effect: Effect.ALLOW,
        resources: [deliveryStream.attrArn],
      })
    );
    configSet.node.addDependency(deliveryStream)

    const eventDestination = new CfnConfigurationSetEventDestination(
      this,
      'SesEventDestination',
      {
        configurationSetName: configSet.ref,
        eventDestination: {
          //cloudWatchDestination -> you can configure this
          enabled: true,
          kinesisFirehoseDestination: {
            deliveryStreamArn: deliveryStream.attrArn,
            iamRoleArn: sesFirehoseAccess.roleArn,
          },
          matchingEventTypes: SES_MATCHING_EVENT_TYPES
            ? Object.entries(SES_MATCHING_EVENT_TYPES)
                .filter(([x, y]) => y)
                .map(([x, y]) => x)
            : [],
        },
      }
    );
    eventDestination.node.addDependency(deliveryStream, configSet);

    //outputs
    new CfnOutput(this, `${kdfOpensearchAccessRoleName}Arn`, {
      value: kdfOpensearchAccessRole.roleArn,
    });
    new CfnOutput(this, `${sesConfigSetOutputName}Name`, {
      value: configSet.ref,
    });
    new CfnOutput(this, `${opensearchDomainName}Id`, {
      value: opensearchDomain.domainId,
    });
    new CfnOutput(this, `${opensearchDomainName}Name`, {
      value: opensearchDomain.domainName,
    });
    new CfnOutput(this, `${opensearchDomainName}Endpoint`, {
      value: opensearchDomain.domainEndpoint,
    });
    new CfnOutput(this, `${opensearchDomainName}Arn`, {
      value: opensearchDomain.domainArn,
    });
  }
}
