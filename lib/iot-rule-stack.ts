import cdk = require('@aws-cdk/core');
import iot = require("@aws-cdk/aws-iot");
import iam = require("@aws-cdk/aws-iam");

//データ連携先Elasticseach domain endpoint/Arnを渡すためのProps
interface IoTRuleStackProps extends cdk.StackProps {
  esDomainEndpoint: string
  esDomainArn: string
}

export class IotRuleStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: IoTRuleStackProps) {
    super(scope, id, props);

    //Rule Action用のIAM Role作成
    const ruleActionRole = new iam.Role(this, 'RuleActionRole', {
      assumedBy: new iam.ServicePrincipal('iot.amazonaws.com')
    });

    //データ連携先のElasticsearch domainへのAPIアクセスを許可
    ruleActionRole.addToPolicy(new iam.PolicyStatement({
      resources: [`${props.esDomainArn}/*`],
      actions: ['es:ESHttp*'] }));

    //IoT Ruleで"data/"以下全てのトピックをフィルタするためのSQL
    const topicFilter: string = "SELECT * FROM 'data/#'"

    //IoT Ruleの作成
    new iot.CfnTopicRule(this, "IotEsRule", {
      ruleName: "ElasticSearchRule",
      topicRulePayload: {
        actions: [{
          elasticsearch: {
            endpoint: `https://${props.esDomainEndpoint}`,
            roleArn: ruleActionRole.roleArn,
            id: '${newuuid()}',
            index: 'sensor-data',
            type: 'sensor-data'
          }
        }],
        ruleDisabled: false,
        sql: topicFilter
      }
    })
  }
}