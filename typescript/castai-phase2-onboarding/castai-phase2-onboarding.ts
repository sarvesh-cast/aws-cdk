import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as cr from 'aws-cdk-lib/custom-resources';
import { variables } from './variables';

export class ClusterRoleStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Role name
        const roleName = `cast-eks-${ClusterName.slice(0, 30)}-cluster-role-${CastAiClusterId.slice(0, 8)}`;
        const clusterVpc = cdk.Fn.importValue(`${ClusterName}-ClusterVpcId`);

        // Inline Policy JSON
        const CastEKSRestrictedAccess = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'RunInstancesTagRestriction',
                    Effect: 'Allow',
                    Action: 'ec2:RunInstances',
                    Resource: `arn:${ARN_PARTITION}:ec2:${region}:${accountNumber}:instance/*`,
                    Condition: {
                        StringEquals: {
                            [`aws:RequestTag/kubernetes.io/cluster/${ClusterName}`]: 'owned',
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
                            [`ec2:ResourceTag/kubernetes.io/cluster/${ClusterName}`]: ['owned', 'shared'],
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
                            [`autoscaling:ResourceTag/kubernetes.io/cluster/${ClusterName}`]: ['owned', 'shared'],
                        },
                    },
                },
                {
                    Sid: 'EKS',
                    Effect: 'Allow',
                    Action: ['eks:Describe*', 'eks:List*', 'eks:TagResource', 'eks:UntagResource'],
                    Resource: [`arn:aws:eks:${region}:${accountNumber}:cluster/${ClusterName}`,
                    `arn:aws:eks:${region}:${accountNumber}:nodegroup/${ClusterName}/*/* `,
                    ],
                },
            ],
        };

        // Check if the IAM role already exists
        const role = new iam.Role(this, 'EksRole', {
            roleName: roleName,
            assumedBy: new iam.PrincipalWithConditions(new iam.ArnPrincipal(UserArn), {
                StringEquals: {
                    'sts:ExternalId': CastAiClusterId,
                },
            }),
            inlinePolicies: {
                CastEKSRestrictedAccess: iam.PolicyDocument.fromJson(CastEKSRestrictedAccess),
            },
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ReadOnlyAccess'), iam.ManagedPolicy.fromAwsManagedPolicyName('IAMReadOnlyAccess'),
                iam.ManagedPolicy.fromManagedPolicyArn(this, 'CustomerManagedPolicy', `arn:aws:iam::${accountNumber}:policy/CastEKSPolicy`),

            ],
            description: `Role to manage '${ClusterName}' EKS cluster used by CAST AI`,
        });

        // Output the Role ARN for reference
        new cdk.CfnOutput(this, 'CastClusterRoleArn', {
            value: role.roleArn,
            description: 'The ARN of the CAST Assume IAM Role',
            exportName: `${ClusterName}-CastClusterRole`,
        });
        const RoleArn = cdk.Fn.importValue(`${ClusterName}-CastClusterRole`);

    }
}

export class Ec2InstanceProfileStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // (Hard Requirement) Role name should follow EXACT FORMAT
        const roleName = `cast-${ClusterName.slice(0, 40)}-eks-${CastAiClusterId.slice(0, 8)}`;

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
            instanceProfileName: roleName,
            roles: [ec2Role.roleName],
        });

        // Output the Role ARN for reference
        new cdk.CfnOutput(this, 'Ec2InstanceProfileRoleArn', {
            value: ec2Role.roleArn,
            description: 'The ARN of the IAM Role',
            exportName: `${ClusterName}-Ec2InstanceProfileRoleArn`,
        });
    }
}

export class EksSecurityGroupStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const sgName = `cast-${ClusterName}-cluster/CastNodeSecurityGroup`;

        const clusterVpc = ec2.Vpc.fromLookup(this, 'EksClusterVpc', {
            isDefault: false, // Adjust as per your setup
            vpcId: ClusterVpcId,
        });
        const vpcId = clusterVpc.vpcId;

        const CastNodeSecurityGroup = new ec2.SecurityGroup(this, 'CastNodeSecurityGroup', {
            vpc: clusterVpc, // Ivpc Type expected (Not VPC ID)
            allowAllOutbound: true,
            description: 'CAST AI created security group that allows communication between CAST AI nodes',
            securityGroupName: sgName,
        });
        cdk.Tags.of(CastNodeSecurityGroup).add('Name', `cast-${ClusterName}-cluster/CastNodeSecurityGroup`);
        cdk.Tags.of(CastNodeSecurityGroup).add('cast:cluster-id', `${CastAiClusterId}`);

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
            exportName: `${ClusterName}-CastNodeSecurityGroupId`,
        });

        new cdk.CfnOutput(this, 'ClusterVpcId', {
            value: vpcId,
            description: 'VPC ID',
            exportName: `${ClusterName}-ClusterVpcId`,
        });
    }
}

export class AccessEntryStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        try {
            const cluster = eks.Cluster.fromClusterAttributes(this, 'Cluster', {
                clusterName: ClusterName
            });

            // Define the Cast IAM Instance role ARN to grant access
            const Ec2InstanceProfileRoleArn = cdk.Fn.importValue(`${ClusterName}-Ec2InstanceProfileRoleArn`);

            const accessScope: eks.AccessScope = {
                type: eks.AccessScopeType.CLUSTER
            };
            const accessEntry = new eks.AccessEntry(this, 'castAiAccessEntry', {
                accessPolicies: [],
                cluster: cluster,
                principal: Ec2InstanceProfileRoleArn,
                accessEntryType: eks.AccessEntryType.EC2_LINUX,
            });
        } catch (e: unknown) {
            console.error('Failed to add access entry to the cluster:', e);
        }
    }
}

export class PostLambdaStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const castIamRoleArn = cdk.Fn.importValue(`${ClusterName}-CastClusterRole`)

        const postLambda = new lambda.Function(this, 'PostLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            handler: 'postcall.handler',
            timeout: cdk.Duration.seconds(30),
            code: lambda.Code.fromAsset(path.join(__dirname, './cast-api-post-call')), // Path to Lambda code
            environment: {
                CastApiKey: CastApiKey,
                ClusterName: ClusterName,
                CastAiClusterId: CastAiClusterId,
                AwsAccount: cdk.Aws.ACCOUNT_ID,
                ArnPartition: cdk.Aws.PARTITION,
                IamRoleArn: castIamRoleArn,
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

// Runtime Parameters
const region = cdk.Aws.REGION;
const accountNumber = cdk.Aws.ACCOUNT_ID;
const ARN_PARTITION = cdk.Aws.PARTITION;

const ClusterName = variables.ClusterName;
const CastAiClusterId = variables.CastAiClusterId;
const ClusterVpcId = variables.ClusterVpcId;
const UserArn = `arn:aws:iam::809060229965:user/cast-crossrole-${CastAiClusterId}`
const CastApiKey = variables.CastApiKey;
const ClusterShortName = `${ClusterName.slice(0, 30)}`
console.log(`Cluster Name: ${ClusterName}`);
console.log(`CAST AI Cluster ID: ${CastAiClusterId}`);
console.log(`User ARN: ${UserArn}`);

const app = new cdk.App();
const EksSecurityGroup_Stack = new EksSecurityGroupStack(app, `${ClusterShortName}-CastAiEksSecurityGroupStack`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});

const ClusterRole_Stack = new ClusterRoleStack(app, `${ClusterShortName}-CastAiClusterRoleStack`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});

const Ec2InstanceProfile_Stack = new Ec2InstanceProfileStack(app, `${ClusterShortName}-CastAiEc2InstanceProfileStack`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});


const AccessEntry_Stack = new AccessEntryStack(app, `${ClusterShortName}-CastAiAccessEntryStack`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});;

const PostLambda_Stack = new PostLambdaStack(app, `${ClusterShortName}-CastAiPostLambdaStack`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});;

ClusterRole_Stack.addDependency(EksSecurityGroup_Stack)
AccessEntry_Stack.addDependency(Ec2InstanceProfile_Stack)
PostLambda_Stack.addDependency(AccessEntry_Stack)