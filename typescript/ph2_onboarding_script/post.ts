import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as cr from 'aws-cdk-lib/custom-resources';
import { variables } from './variables';

const AwsAccount = process.env.CDK_DEFAULT_ACCOUNT
const ClusterName = variables.ClusterName;
const CastAiClusterId = variables.CastAiClusterId;
const CastApiKey = variables.CastApiKey;

export class PostLambdaStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const postLambda = new lambda.Function(this, 'PostLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            handler: 'postcall.handler',
            timeout: cdk.Duration.seconds(30),
            code: lambda.Code.fromAsset(path.join(__dirname, './post')), // Path to Lambda code
            environment: {
                CastApiKey: CastApiKey,
                ClusterName: ClusterName,
                CastAiClusterId: CastAiClusterId,
                AwsAccount: cdk.Aws.ACCOUNT_ID,
                ArnPartition: cdk.Aws.PARTITION,
            },
        });

        const provider = new cr.Provider(this, 'PostLambdaProvider', {
            onEventHandler: postLambda, // The Lambda function to run
        });

        new cdk.CustomResource(this, 'PostLambdaTrigger', {
            serviceToken: provider.serviceToken,
        });

        new cdk.CfnOutput(this, 'PostLambdaArn', {
            value: postLambda.functionArn,
        });
    }
}
const app = new cdk.App();
const ClusterShortName = `${ClusterName.slice(0, 30)}`
const PostLambda_Stack = new PostLambdaStack(app, `${ClusterShortName}-CastAiPostLambdaStack`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});;