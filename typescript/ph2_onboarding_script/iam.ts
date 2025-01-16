import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
// import * as sts from 'aws-cdk-lib/aws-sts';

export class IamRoleWithInlinePoliciesStack extends cdk.Stack {
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
        const roleName = `test-cast-eks-${clusterName.slice(0, 30)}-cluster-role-${castAiClusterId.slice(0, 8)}`;

        const CastEKSPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'PassRoleEC2',
                    Action: 'iam:PassRole',
                    Effect: 'Allow',
                    Resource: `arn:${ARN_PARTITION}:iam::*:role/*`,
                    Condition: {
                        StringEquals: {
                            'iam:PassedToService': 'ec2.amazonaws.com',
                        },
                    },
                },
                {
                    Sid: 'NonResourcePermissions',
                    Effect: 'Allow',
                    Action: [
                        'iam:CreateServiceLinkedRole',
                        'ec2:CreateKeyPair',
                        'ec2:DeleteKeyPair',
                        'ec2:CreateTags',
                        'ec2:ImportKeyPair',
                    ],
                    Resource: '*',
                },
                {
                    Sid: 'RunInstancesPermissions',
                    Effect: 'Allow',
                    Action: 'ec2:RunInstances',
                    Resource: [
                        `arn:${ARN_PARTITION}:ec2:*:${accountNumber}:network-interface/*`,
                        `arn:${ARN_PARTITION}:ec2:*:${accountNumber}:security-group/*`,
                        `arn:${ARN_PARTITION}:ec2:*:${accountNumber}:volume/*`,
                        `arn:${ARN_PARTITION}:ec2:*:${accountNumber}:key-pair/*`,
                        `arn:${ARN_PARTITION}:ec2:*::image/*`,
                    ],
                },
            ],
        };

        // Inline Policy JSON
        const CastEKSRestrictedAccess = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'RunInstancesTagRestriction',
                    Effect: 'Allow',
                    Action: 'ec2:RunInstances',
                    Resource: `arn:aws:ec2:${region}:${accountNumber}:instance/*`,
                    Condition: {
                        StringEquals: {
                            [`aws:RequestTag/kubernetes.io/cluster/${clusterName}`]: 'owned',
                        },
                    },
                },
                {
                    Sid: 'RunInstancesVpcRestriction',
                    Effect: 'Allow',
                    Action: 'ec2:RunInstances',
                    Resource: `arn:aws:ec2:${region}:${accountNumber}:subnet/*`,
                    Condition: {
                        StringEquals: {
                            'ec2:Vpc': `arn:aws:ec2:${region}:${accountNumber}:vpc/${clusterVpc}`,
                        },
                    },
                },
                {
                    Sid: 'InstanceActionsTagRestriction',
                    Effect: 'Allow',
                    Action: ['ec2:TerminateInstances', 'ec2:StartInstances', 'ec2:StopInstances', 'ec2:CreateTags'],
                    Resource: `arn:aws:ec2:${region}:${accountNumber}:instance/*`,
                    Condition: {
                        StringEquals: {
                            'ec2:ResourceTag/kubernetes.io/cluster/${clusterName}': ['owned', 'shared'],
                        },
                    },
                },
                {
                    Sid: 'AutoscalingActionsTagRestriction',
                    Effect: 'Allow',
                    Action: [
                        'autoscaling:UpdateAutoScalingGroup',
                        'autoscaling:SuspendProcesses',
                        'autoscaling:ResumeProcesses',
                        'autoscaling:TerminateInstanceInAutoScalingGroup',
                    ],
                    Resource: `arn:aws:autoscaling:${region}:${accountNumber}:autoScalingGroup:*:autoScalingGroupName/*`,
                    Condition: {
                        StringEquals: {
                            'autoscaling:ResourceTag/kubernetes.io/cluster/${clusterName}': ['owned', 'shared'],
                        },
                    },
                },
                {
                    Sid: 'EKS',
                    Effect: 'Allow',
                    Action: ['eks:Describe*', 'eks:List*', 'eks:TagResource', 'eks:UntagResource'],
                    Resource: [
                        `arn:aws:eks:${region}:${accountNumber}:cluster/${clusterName}`,
                        `arn:aws:eks:${region}:${accountNumber}:nodegroup/${clusterName}/*/*`,
                    ],
                },
            ],
        };

        // Check if the IAM role already exists
        const role = new iam.Role(this, 'EksRole', {
            roleName: roleName,
            assumedBy: new iam.PrincipalWithConditions(new iam.ArnPrincipal(userArn), {
                StringEquals: {
                    'sts:ExternalId': castAiClusterId, // External ID condition
                },
            }), // Allow a specific user or service with conditions
            inlinePolicies: {
                CastEKSRestrictedAccess: iam.PolicyDocument.fromJson(CastEKSRestrictedAccess),
                CastEKSPolicy: iam.PolicyDocument.fromJson(CastEKSPolicy),
            },
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ReadOnlyAccess'), iam.ManagedPolicy.fromAwsManagedPolicyName('IAMReadOnlyAccess'),
            ],
            description: `Role to manage '${clusterName}' EKS cluster used by CAST AI`,
        });

        // Output the Role ARN for reference
        new cdk.CfnOutput(this, 'RoleArn', {
            value: role.roleArn,
            description: 'The ARN of the IAM Role',
        });
    }
}

// Define the CDK app and stack outside of the class
const app = new cdk.App();
new IamRoleWithInlinePoliciesStack(app, 'IamRoleWithInlinePoliciesStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});
