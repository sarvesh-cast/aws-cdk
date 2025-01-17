import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';

export class ClusterRoleStack extends cdk.Stack {
    constructor(scope: Construct, id: string, ARN_PARTITION: string, clusterVpc: string, region: string, accountNumber: string, clusterName: string, castAiClusterId: string, userArn: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Role name
        const roleName = `test-new-cast-eks-${clusterName.slice(0, 30)}-cluster-role-${castAiClusterId.slice(0, 8)}`;

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
                            [`ec2:ResourceTag/kubernetes.io/cluster/${clusterName}`]: ['owned', 'shared'],
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
                            [`autoscaling: ResourceTag/kubernetes.io/cluster/${clusterName}`]: ['owned', 'shared'],
                        },
                    },
                },
                {
                    Sid: 'EKS',
                    Effect: 'Allow',
                    Action: ['eks:Describe*', 'eks:List*', 'eks:TagResource', 'eks:UntagResource'],
                    Resource: [`arn:aws:eks:${region}:${accountNumber}:cluster/${clusterName}`,
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
                    'sts:ExternalId': castAiClusterId,
                },
            }),
            inlinePolicies: {
                CastEKSRestrictedAccess: iam.PolicyDocument.fromJson(CastEKSRestrictedAccess),
            },
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ReadOnlyAccess'), iam.ManagedPolicy.fromAwsManagedPolicyName('IAMReadOnlyAccess'),
                iam.ManagedPolicy.fromManagedPolicyArn(this, 'CustomerManagedPolicy', `arn:aws:iam::${accountNumber}:policy/CastEKSPolicy`),

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

export class Ec2InstanceProfileStack extends cdk.Stack {
    constructor(scope: Construct, id: string, ARN_PARTITION: string, clusterVpc: string, region: string, accountNumber: string, clusterName: string, castAiClusterId: string, userArn: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Role name
        const roleName = `new-test-cast-${clusterName.slice(0, 40)}-eks-${castAiClusterId.slice(0, 8)}`;

        const ec2Role = new iam.Role(this, 'Ec2InstanceRole', {
            roleName: `${roleName}`,
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'), iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'), iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
                iam.ManagedPolicy.fromManagedPolicyArn(this, 'CustomerManagedPolicy', `arn:aws:iam::${accountNumber}:policy/CastEC2AssignIPv6Policy`), // Attach customer-managed policy

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

export class EksSecurityGroupStack extends cdk.Stack {
    constructor(scope: Construct, id: string, ARN_PARTITION: string, region: string, accountNumber: string, clusterName: string, castAiClusterId: string, userArn: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const eksClusterName = 'eks-10101-sar';

        // Import the existing EKS cluster
        const eksCluster = eks.Cluster.fromClusterAttributes(this, 'ImportedCluster', {
            clusterName: eksClusterName,
            vpc: ec2.Vpc.fromLookup(this, 'EksClusterVpc', {
                isDefault: false, // Adjust as per your setup
                tags: {
                    'alpha.eksctl.io/cluster-name': eksClusterName,
                },
            }),
        });

        // Access the VPC of the EKS cluster
        const clusterVpc = eksCluster.vpc;

        // Define the security group name
        const sgName = `cast-${eksClusterName}-cluster/CastNodeSecurityGroup-test`;

        const CastNodeSecurityGroup = new ec2.SecurityGroup(this, 'CastNodeSecurityGroup-test', {
            vpc: clusterVpc,
            allowAllOutbound: true,
            description: 'CAST AI created security group that allows communication between CAST AI nodes',
            securityGroupName: sgName,
        });
        cdk.Tags.of(CastNodeSecurityGroup).add('Name', `cast-${eksClusterName}-cluster/CastNodeSecurityGroup-test`);

        // Allow ingress traffic only from the same security group
        CastNodeSecurityGroup.addIngressRule(
            CastNodeSecurityGroup, // Peer is the same security group
            ec2.Port.allTraffic(), // Allow all traffic
            'Allow traffic from the same security group'
        );


        // Output the security group ID for reference
        new cdk.CfnOutput(this, 'CastNodeSecurityGroupId', {
            value: CastNodeSecurityGroup.securityGroupId,
            description: 'The ID of the CAST AI node security group',
        });
    }
}

// Define the CDK app and stack outside of the class
const app = new cdk.App();

// Parameters
const ARN_PARTITION = cdk.Aws.PARTITION; // AWS or AWS GovCloud
const clusterVpc = 'vpc-0eb895901e130463a'; // VPC ID
const region = cdk.Aws.REGION; // Region (use CDK's region)
const accountNumber = cdk.Aws.ACCOUNT_ID; // AWS Account number
const clusterName = 'eks-10101-sar'; // Cluster 
const castAiClusterId = '9f3e2cc0-xxxx-411c-9208-ae8bb18986cb'; // CAST AI cluster ID
const userArn = 'arn:aws:iam::809060229965:user/cast-crossrole-9f3e2cc0-8c14-411c-9208-ae8bb18986cb'; // User ARN

new Ec2InstanceProfileStack(app, 'Ec2InstanceProfileStack', ARN_PARTITION, clusterVpc, region, accountNumber, clusterName, castAiClusterId, userArn, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});

new ClusterRoleStack(app, 'ClusterRoleStack', ARN_PARTITION, clusterVpc, region, accountNumber, clusterName, castAiClusterId, userArn, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});

new EksSecurityGroupStack(app, 'EksSecurityGroupStack', ARN_PARTITION, region, accountNumber, clusterName, castAiClusterId, userArn, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});