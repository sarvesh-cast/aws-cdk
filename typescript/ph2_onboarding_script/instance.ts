import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
// import * as sts from 'aws-cdk-lib/aws-sts';

export class Ec2InstanceProfileStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Parameters
        const ARN_PARTITION = cdk.Aws.PARTITION; // AWS or AWS GovCloud
        const clusterVpc = 'vpc-0eb895901e130463a'; // VPC ID
        const region = this.region; // Region (use CDK's region)
        const accountNumber = this.account; // AWS Account number
        const clusterName = 'eks-10101-sar'; // Cluster 
        const castAiClusterId = '9f3e2cc0-xxxx-411c-9208-ae8bb18986cb'; // CAST AI cluster ID
        const userArn = 'arn:aws:iam::809060229965:user/cast-crossrole-9f3e2cc0-8c14-411c-9208-ae8bb18986cb'; // User ARN (this will be dynamically determined in a real case)

        // Role name
        const roleName = `new-test-cast-${clusterName.slice(0, 40)}-eks-${castAiClusterId.slice(0, 8)}`;

        const ec2Role = new iam.Role(this, 'Ec2InstanceRole', {
            roleName: `${roleName}`,
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'), iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'), iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy')
            ],
            description: 'EKS node instance role used by CAST AI',
        });

        // Create an instance profile associated with the role
        const instanceProfile = new iam.CfnInstanceProfile(this, 'Ec2InstanceProfile', {
            roles: [ec2Role.roleName],
        });

        // Output the Role ARN for reference
        new cdk.CfnOutput(this, 'RoleArn', {
            value: ec2Role.roleArn,
            description: 'The ARN of the IAM Role',
        });
    }
}

// Define the CDK app and stack outside of the class
const app = new cdk.App();
new Ec2InstanceProfileStack(app, 'Ec2InstanceProfileStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});
