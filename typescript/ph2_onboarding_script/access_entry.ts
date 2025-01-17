import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';

export class AccessEntryCdkStack extends cdk.Stack {
    constructor(scope: Construct, id: string, clusterName: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // The code that defines your stack goes here
        try {
            // Define the EKS cluster
            const cluster = eks.Cluster.fromClusterAttributes(this, 'Cluster', {
                clusterName: `${clusterName}`
            });

            // Define the static IAM role ARN to grant access
            const staticRoleArn = 'arn:aws:iam::050451381948:role/cast-eks-10101-sar-eks-9f3e2cc0'; // Replace with your static role ARN

            const accessScope: eks.AccessScope = {
                type: eks.AccessScopeType.CLUSTER
            };
            const accessEntry = new eks.AccessEntry(this, 'castAiAccessEntry', {
                accessPolicies: [],
                cluster: cluster,
                principal: staticRoleArn,
                accessEntryType: eks.AccessEntryType.EC2_LINUX,
            });
        } catch (e: unknown) {
            console.error('Failed to add access entry to the cluster:', e);
        }
    }
}
const clusterName = 'eks-10101-sar'; // Cluster 
const app = new cdk.App();
new AccessEntryCdkStack(app, 'AccessEntryCdkStack', clusterName, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});