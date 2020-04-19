import cdk = require('@aws-cdk/core');
import iot = require('@aws-cdk/aws-iot');
import lambda = require('@aws-cdk/aws-lambda');
import greengrass = require('@aws-cdk/aws-greengrass');
import iam = require("@aws-cdk/aws-iam");

// Lamba FunctionのAliasをGreengrass Coreに渡すためのProps
interface GreengrassStackProps extends cdk.StackProps {
  greengrassLambdaAlias: lambda.Alias
}

export class GreengrassStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: GreengrassStackProps) {
    super(scope, id, props)

    const region: string = cdk.Stack.of(this).region;
    const accountId: string = cdk.Stack.of(this).account;
    const certArn = this.node.tryGetContext('greengrassCoreCertArn'); //contextからクライアント証明書のARNを取得
    const thingName = this.node.tryGetContext('greengrassCoreThingName') //contextからThing Nameを取得
    const groupName = this.node.tryGetContext('grenngrassGroupName') //contextからGreengrass Grpup Nameを取得

    // Greengrass Core用IoT Thingの作成
    const iotThing = new iot.CfnThing(this, 'Thing', {
      thingName: thingName
    });

    if (iotThing.thingName !== undefined) {
      // IoT Policyの作成
      const iotPolicy = new iot.CfnPolicy(this, 'Policy', {
        policyName: 'IoT_Greengrass_Policy',
        policyDocument: {
          "Version": "2012-10-17",
          "Statement": [
            {
              "Effect": "Allow",
              "Action": [
                "iot:Publish",
                "iot:Subscribe",
                "iot:Connect",
                "iot:Receive"
              ],
              "Resource": [
                "*"
              ]
            },
            {
              "Effect": "Allow",
              "Action": [
                "iot:GetThingShadow",
                "iot:UpdateThingShadow",
                "iot:DeleteThingShadow"
              ],
              "Resource": [
                "*"
              ]
            },
            {
              "Effect": "Allow",
              "Action": [
                "greengrass:*"
              ],
              "Resource": [
                "*"
              ]
            }
          ]
        }
      });

      // IoT Policyを証明書にアタッチ
      if (iotPolicy.policyName !== undefined) {
        const policyPrincipalAttachment = new iot.CfnPolicyPrincipalAttachment(this, 'PolicyPrincipalAttachment', {
          policyName: iotPolicy.policyName,
          principal: certArn
        });
        policyPrincipalAttachment.addDependsOn(iotPolicy)
      }

      // IoT Thingを証明書にアタッチ
      const thingPrincipalAttachment = new iot.CfnThingPrincipalAttachment(this, 'ThingPrincipalAttachment', {
        thingName: iotThing.thingName,
        principal: certArn
      });
      thingPrincipalAttachment.addDependsOn(iotThing)

      // Greengrass Core Definitionの作成
      const thingArn = `arn:aws:iot:${region}:${accountId}:thing/${iotThing.thingName}`;
      const coreDefinition = new greengrass.CfnCoreDefinition(this, 'CoreDefinition', {
        name: 'Core'
      });

      // Greengrass Core Definition Versionの作成
      const coreDefinitionVersion = new greengrass.CfnCoreDefinitionVersion(this, 'CoreDefinitionVersion', {
        coreDefinitionId: coreDefinition.attrId,
        cores: [
          {
            certificateArn: certArn,
            id: '1',
            thingArn: thingArn
          }
        ]
      });
      coreDefinition.addDependsOn(iotThing)

      // Greengrass Resourceの作成
      const resourceDefinition = new greengrass.CfnResourceDefinition(this, 'ResourceDefinition', {
        name: 'Resource',
      });

      // Greengrass Resource Versionの作成(シリアルデバイス)
      const resourceDefinitionVersion = new greengrass.CfnResourceDefinitionVersion(this, 'ResourceDefinitionVersion', {
        resourceDefinitionId: resourceDefinition.attrId,
        resources: [
          {
            id: '1',
            name: 'serial_resource',
            resourceDataContainer: {
              localDeviceResourceData: {
                sourcePath: '/dev/ttyS0',
                groupOwnerSetting: {
                  autoAddGroupOwner: false,
                  groupOwner: 'dialout'
                }
              }
            }
          },
        ]
      });

      // Greengrass Lambda Definitionの作成
      const functionDefinition = new greengrass.CfnFunctionDefinition(this, 'FunctionDefinition', {
        name: 'Lambda_Function'
      });

      // Greengrass Lambda Definition Versionの作成
      const functionDefinitionVersion = new greengrass.CfnFunctionDefinitionVersion(this, 'FunctionDefinitionVersion', {
        functionDefinitionId: functionDefinition.attrId,
        functions: [
          {
            id: '1',
            functionArn: props.greengrassLambdaAlias.functionArn,
            functionConfiguration: {
              encodingType: 'binary',
              memorySize: 65536,
              pinned: true,
              timeout: 3,
              environment: {
                resourceAccessPolicies: [
                  {
                    resourceId: '1',
                    permission: 'rw'
                  }
                ]
              }
            }
          }
        ]
      });

      // Greengrass Subscriptionの作成
      const subscriptionDefinition = new greengrass.CfnSubscriptionDefinition(this, 'SubscriptionDefinition', {
        name: 'Subscription'
      });

      // Greengrass Subscription Versionの作成(Greengrass LambdaからAWS IoTへのPublish用)
      const subscriptionDefinitionVersion = new greengrass.CfnSubscriptionDefinitionVersion(this, 'SubscriptionDefinitionVersion', {
        subscriptionDefinitionId: subscriptionDefinition.attrId,
        subscriptions: [
          {
            id: '1',
            source: props.greengrassLambdaAlias.functionArn,
            subject: "data/#",
            target: "cloud" 
          } 
        ] 
      });
      
      // Logger Definitionの作成
      const loggerDefinition = new greengrass.CfnLoggerDefinition(this, 'LoggerDefinition', {
        name: 'Lambda_Logger'
      });

      // Logger Definition Versionの作成
      const loggerDefinitionVersion = new greengrass.CfnLoggerDefinitionVersion(this, 'LoggerDefinitionVersion', {
        loggerDefinitionId: loggerDefinition.attrId,
        loggers: [
          {
            id: '1',
            component: 'Lambda',
            level: 'DEBUG',
            space: 25000,
            type: 'FileSystem'
          }
        ]
      });

      //Greengrass Grouoに付与するRole(今回はAWSサービスへのアクセスはないためポリシー付与しない)
      const greengrassRole = new iam.Role(this, 'greengrassRole', {
        assumedBy: new iam.ServicePrincipal('greengrass.amazonaws.com')
      });

      // Greengrass Groupの作成
      const greengrassGroup = new greengrass.CfnGroup(this, 'Group', {
        name: groupName,
        roleArn: greengrassRole.roleArn
      });

      // Greengrass Group Versionの作成
      const greengrassGroupVersion = new greengrass.CfnGroupVersion(this, 'GroupVersion', {
        groupId: greengrassGroup.attrId,
        coreDefinitionVersionArn: coreDefinitionVersion.ref,
        resourceDefinitionVersionArn: resourceDefinitionVersion.ref,
        functionDefinitionVersionArn: functionDefinitionVersion.ref,
        subscriptionDefinitionVersionArn: subscriptionDefinitionVersion.ref,
        loggerDefinitionVersionArn: loggerDefinitionVersion.ref
      });

    }
  }
}
