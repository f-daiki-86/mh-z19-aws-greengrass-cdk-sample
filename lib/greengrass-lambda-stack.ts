import cdk = require('@aws-cdk/core');
import lambda = require('@aws-cdk/aws-lambda');
 
export class GreengrassLambdaStack extends cdk.Stack {

    //Lambda FuntionのAliasをGreengrass Stackに渡すためのProperty
    public readonly greengrassLambdaAlias: lambda.Alias;
 
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
 
        //Lambda Functionの作成
        const greengrassLambda = new lambda.Function(this, 'GreengrassLambdaHandler', {
            runtime: lambda.Runtime.PYTHON_3_7,
            code: lambda.Code.asset('handlers/co2-sensor-reader'),
            handler: 'handler.handler'
        });
        //Functionのコードの変更やライブラリの追加/更新時はAliasを新しいバージョンを発行する
        const version = greengrassLambda.addVersion('1');
 
        // GreengrassにLambdaをデプロイする場合、デプロイしたいバージョンにエイリアスを指定する必要がある
        this.greengrassLambdaAlias = new lambda.Alias(this, 'GreengrassLambdaAlias', {
            aliasName: 'greengrass_deploy',
            version: version
        })
    }
}