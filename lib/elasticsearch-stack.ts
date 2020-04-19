import cdk = require('@aws-cdk/core');
import es = require('@aws-cdk/aws-elasticsearch');
import sns = require('@aws-cdk/aws-sns');
import iam = require("@aws-cdk/aws-iam");

export class ElasticsearchStack extends cdk.Stack {
  //Endpoint名とArnをIoT Rule Stackに渡すためのProperty
  public endpoint: string;
  public arn: string;
 
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
 
    const sourceIp = this.node.tryGetContext('esSourceIp'); //Kibanaへのアクセスを許可するIPアドレス
    const domainName = 'home-sensors'
    const instanceType = "t2.small.elasticsearch"
    const instanceCount = 1
    const volumeSize = 10
    const esVersion = "7.1"
    const encryption = false
  
    //Elasticsearchドメインの作成
    const domain = new es.CfnDomain(this, 'Domain', {
      accessPolicies: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              AWS: [
                '*'
              ]
            },
            Action: [
              'es:*'
            ],
            Resource: `arn:aws:es:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:domain/${domainName}/*`,
            Condition: {
              IpAddress: {
                'aws:SourceIp': sourceIp
              }
            }
          }
        ]
      },
      domainName: domainName,
      ebsOptions: {
        ebsEnabled: true,
        volumeSize: volumeSize,
        volumeType: 'gp2',
      },
      elasticsearchClusterConfig: {
        instanceCount: instanceCount,
        instanceType: instanceType,
      },
      elasticsearchVersion: esVersion,
      encryptionAtRestOptions: {
        enabled: encryption
      },
      nodeToNodeEncryptionOptions: {
        enabled: false
      },
      snapshotOptions: {
        automatedSnapshotStartHour: 0
      }
    });
 
    this.endpoint = domain.attrDomainEndpoint;
    this.arn = domain.attrArn;

    //アラート通知用SNS Topic作成(ElasticsearchからSlack通知だけなら不要)
    const esAlertTopic = new sns.Topic(this, 'ESAlertTopic', {
      displayName: 'A Topic for ElasticSearch'
    });

    //ElascitsearchからSNS TopicにPublishするためのIAM Role
    const esAlertRole = new iam.Role(this, 'EsAlertRole', {
      assumedBy: new iam.ServicePrincipal('es.amazonaws.com')
    });

    esAlertRole.addToPolicy(new iam.PolicyStatement({
      resources: [esAlertTopic.topicArn],
      actions: ['sns:Publish'] }));
  }
}