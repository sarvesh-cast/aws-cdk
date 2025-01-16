import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';

export class EksSecurityGroupStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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
        const existingSecurityGroup = ec2.SecurityGroup.fromLookupByName(this, 'ExistingSecurityGroup', sgName, clusterVpc);


        if (existingSecurityGroup) {
            console.log(`Security group "${sgName}" already exists.`);
        } else {
            console.log(`Security group "${sgName}" does not exist. Creating...`);
            // Create the CAST AI node security group
            const CastNodeSecurityGroup = new ec2.SecurityGroup(this, 'CastNodeSecurityGroup-test', {
                vpc: clusterVpc,
                allowAllOutbound: true, // Enables all egress traffic by default
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

}
const app = new cdk.App();
new EksSecurityGroupStack(app, 'EksSecurityGroupStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});