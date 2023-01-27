# Guide

Implements ses-config-set -> firehose stream -> opensearch domain integration allowing you to push your ses events (sends, rejects, deliveries, hard bounces and complaints to opensearch domain).

Read more about the solution at: <https://aws.amazon.com/premiumsupport/knowledge-center/ses-email-sending-history/>

For additional reference on how to configure domain for FGAC (Fine Grain Access Control),  : <https://docs.aws.amazon.com/opensearch-service/latest/developerguide/fgac.html>

## Instruction

    1) preps:
        - appropriate aws-creds+ profile set up
        - aws-cdk cli with the latest version. 
        - Also use aws-cli to check aws sts get-caller-identity --profile profile_name when in doubt (for that install aws cli)
        - npm install
    1) edit the app: 
       1) edit default-settings.json as necessary (this instruction is for non-vpc setup). Note that is where you edit opensearch instance sizes, ses event types configurations so forth
       2) edit bin/ses-kdf-opensearch.ts for appName + indexName.  You can also pass additional overrides to the default-settings.json (refer to SesKdfOpensearchProps defined in lib/ses-kdf-opensearch-stack.ts)
       3) npm run test
    2) run cdk
       1) cdk deploy --no-rollback (avoid rollback)
       2) note reference to outputs from CDK (you need some of them)
    3) configure opensearch: 
       1)  go to aws opensearch service console -> domain -> security and edit master username and login to opensearch dashboard 
       2) create a firehose role, add permissions: you need the ff policy
          
          {
               "cluster_permissions": [
                   "cluster_composite_ops",
                   "cluster_monitor"
               ],
               "index_permissions": [{
                   "index_patterns": [
                       "firehose-index*"
                   ],
                   "allowed_actions": [
                       "create_index",
                       "manage",
                       "crud"
                   ]
               }]
           }
       3) from role > map users: backend role -> IAM role Name in output (firehose opensearch access roleArn)
       4) from stack-management > create index_pattern = indexName 
    4) test: kdf-opensearch integration: 
          1) go to KDF console, send test data (the test will stop if you don't leave the browser tab open), and edit kdf configuration > opensearch destination > buffering =  60 sec (the min value you can use : just for testing: for prod, change it back to 5 minutes)
          2)  then go  to opensearch dashboard > from discover > pick index_pattern
          3)  search for * => you should see the test data (you can also run other DQL)
          4)  stop test from kdf
    5)  go to ses > verified identities> config set > select the config_set name (name from cdk output -> configSetName) as your default configuration set
    6)  test ses-kdf-opensearch integration
        1)  click on send test email
        2)  head to opensearch discovery, narrow the search to the last few minutes and search star in for the same index pattern

## Useful CDK commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
