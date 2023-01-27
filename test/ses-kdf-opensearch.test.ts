import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { SesKdfOpensearchStack } from '../lib/ses-kdf-opensearch-stack';

//? rudimentary test to ensure the stack is created: more resources that could be tested including logGroup, roles, lambda function, s3 bucket etc. Only test the main components here
//TODO add more tests
describe('Stack', () => {
  test('creates an OpenSearch domain and a Kinesis Data Firehose delivery stream with the correct outputs', () => {
    // Create the stack
    const app = new App();
    let appName = 'test-app';
    let indexName = 'test-index';
    let sesConfigSetOutputName = `${appName}-ses-config-set`;
    let opensearchDomainName = `${appName}-opensearch-domain`;

    const stack = new SesKdfOpensearchStack(app, 'KdfOpensearchStack', {
      appName,
      indexName,
    });
    const template = Template.fromStack(stack);
    console.log(template.toJSON());

    /*
    Quickly Verify resources exist
    ses: config set, event-destination 
    KDF:  delivery stream 
    opensearch:  domain 
    */
    template.hasResourceProperties('AWS::SES::ConfigurationSet', {});
    template.hasResourceProperties('AWS::SES::ConfigurationSetEventDestination', {});  
    template.hasResourceProperties('AWS::OpenSearchService::Domain', {
      DomainName: `${appName}-opensearch-domain`,
    });
    template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
      AmazonopensearchserviceDestinationConfiguration: {
        IndexName: indexName,
      },
    });

    //test outputs are created
    [
      `${sesConfigSetOutputName}Name`,
      `${opensearchDomainName}Id`,
      `${opensearchDomainName}Name`,
      `${opensearchDomainName}Arn`,
      `${opensearchDomainName}Endpoint`,
    ]
      .map((x) => x.replace(/-/g, ''))
      .map((x) => template.hasOutput(x, {}));
  });
});
