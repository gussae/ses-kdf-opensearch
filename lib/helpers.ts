import { SubnetType } from 'aws-cdk-lib/aws-ec2';
import { EngineVersion } from 'aws-cdk-lib/aws-opensearchservice';

export const getOpensearchVersion = (version: string) => {
  switch (version) {
    case '1':
    case '1.0':
      return EngineVersion.OPENSEARCH_1_0;
    case '1.1':
      return EngineVersion.OPENSEARCH_1_1;
    case '1.2':
      return EngineVersion.OPENSEARCH_1_2;
    case '1.3':
      return EngineVersion.OPENSEARCH_1_3;
    default:
      return EngineVersion.OPENSEARCH_1_3;
  }
};

export const getSubnetType = (subnet: string) => {
  switch (subnet) {
    case 'PUBLIC':
      return SubnetType.PUBLIC;
    case 'PRIVATE_ISOLATED':
      return SubnetType.PRIVATE_ISOLATED;
    case 'PRIVATE_WITH_EGRESS':
      return SubnetType.PRIVATE_WITH_EGRESS;
    default:
      throw new Error('Invalid subnet type');
  }
};
