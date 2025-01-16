// import * as cdk from 'aws-cdk-lib';
// import { Construct } from 'constructs';
// import { execSync } from 'child_process';
// import { IAMClient, CreateRoleCommand, UpdateAssumeRolePolicyCommand, GetRoleCommand, AttachRolePolicyCommand, CreatePolicyCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
// import { EKSClient, DescribeClusterCommand, ListAccessEntriesCommand, CreateAccessEntryCommand } from "@aws-sdk/client-eks";

// export class CastEksIntegrationStack extends cdk.Stack {
//   constructor(scope: Construct, id: string, props?: cdk.StackProps) {
//     super(scope, id, props);

//     const REGION = process.env.REGION || 'us-east-1';
//     const CLUSTER_NAME = process.env.CLUSTER_NAME || 'my-cluster';
//     const CASTAI_CLUSTER_ID = process.env.CASTAI_CLUSTER_ID || 'castai-cluster-id';
//     const CASTAI_API_URL = process.env.CASTAI_API_URL || 'https://api.cast.ai';
//     const CASTAI_API_TOKEN = process.env.CASTAI_API_TOKEN || '';

//     const client = new IAMClient({ region: REGION });
//     const eksClient = new EKSClient({ region: REGION });

//     // 1. Retrieve Cluster Info
//     const getClusterVpcId = async (): Promise<string> => {
//       const cluster = await eksClient.send(new DescribeClusterCommand({ name: CLUSTER_NAME }));
//       if (!cluster.cluster?.resourcesVpcConfig?.vpcId) {
//         throw new Error('Could not find VPC ID for the cluster.');
//       }
//       return cluster.cluster.resourcesVpcConfig.vpcId;
//     };

//     // 2. Check Authentication Mode
//     const getAuthenticationMode = (): string => {
//       const result = execSync(`aws eks describe-cluster --name ${CLUSTER_NAME} --region ${REGION} | grep authenticationMode || echo "CONFIG_MAP"`).toString().trim();
//       return result || 'CONFIG_MAP';
//     };

//     // 3. Create IAM Role
//     const createOrUpdateRole = async (roleName: string, assumeRolePolicyDocument: string): Promise<string> => {
//       try {
//         const role = await client.send(new GetRoleCommand({ RoleName: roleName }));
//         console.log(`Role already exists: ${roleName}`);
//         await client.send(new UpdateAssumeRolePolicyCommand({
//           RoleName: roleName,
//           PolicyDocument: assumeRolePolicyDocument,
//         }));
//         return role.Role?.Arn || '';
//       } catch (error) {
//         console.log(`Creating role: ${roleName}`);
//         const newRole = await client.send(new CreateRoleCommand({
//           RoleName: roleName,
//           AssumeRolePolicyDocument: assumeRolePolicyDocument,
//           Description: `Role to manage ${CLUSTER_NAME} EKS cluster for CAST AI`,
//         }));
//         return newRole.Role?.Arn || '';
//       }
//     };

//     // 4. Attach Inline and Managed Policies
//     const attachPolicies = async (roleName: string, policyArns: string[], inlinePolicyName: string, inlinePolicyDocument: string): Promise<void> => {
//       for (const policyArn of policyArns) {
//         await client.send(new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: policyArn }));
//       }
//       await client.send(new PutRolePolicyCommand({
//         RoleName: roleName,
//         PolicyName: inlinePolicyName,
//         PolicyDocument: inlinePolicyDocument,
//       }));
//     };

//     // 5. Add Access Entries to EKS
//     const addAccessEntry = async (roleArn: string): Promise<void> => {
//       const accessEntries = await eksClient.send(new ListAccessEntriesCommand({ clusterName: CLUSTER_NAME }));
//       const exists = accessEntries.accessEntries?.some(entry => entry.principalArn === roleArn);
//       if (!exists) {
//         console.log('Adding access entry...');
//         await eksClient.send(new CreateAccessEntryCommand({
//           clusterName: CLUSTER_NAME,
//           principalArn: roleArn,
//           type: 'EC2_LINUX',
//         }));
//       } else {
//         console.log('Access entry already exists.');
//       }
//     };

//     // 6. Send Role ARN to CAST.AI
//     const sendRoleArnToCastAI = async (roleArn: string): Promise<void> => {
//       const apiUrl = `${CASTAI_API_URL}/v1/kubernetes/external-clusters/${CASTAI_CLUSTER_ID}`;
//       const body = JSON.stringify({ eks: { assumeRoleArn: roleArn } });
//       const curlCommand = `curl -sSL -X POST -H "X-API-Key: ${CASTAI_API_TOKEN}" -d '${body}' ${apiUrl}`;
//       const response = execSync(curlCommand).toString();
//       console.log(`CAST.AI response: ${response}`);
//     };

//     (async () => {
//       try {
//         const clusterVpcId = await getClusterVpcId();
//         const authMode = getAuthenticationMode();
//         console.log(`Authentication mode is: ${authMode}`);

//         const roleName = `cast-eks-${CLUSTER_NAME.substring(0, 30)}-cluster-role-${CASTAI_CLUSTER_ID.substring(0, 8)}`;
//         const assumeRolePolicyDocument = JSON.stringify({
//           Version: '2012-10-17',
//           Statement: [{
//             Effect: 'Allow',
//             Principal: { AWS: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:root` },
//             Action: 'sts:AssumeRole',
//             Condition: { StringEquals: { 'sts:ExternalId': CASTAI_CLUSTER_ID } },
//           }],
//         });

//         const roleArn = await createOrUpdateRole(roleName, assumeRolePolicyDocument);

//         const policyArns = [
//           'arn:aws:iam::aws:policy/AmazonEC2ReadOnlyAccess',
//           'arn:aws:iam::aws:policy/IAMReadOnlyAccess',
//         ];
//         const inlinePolicyName = 'CastEKSRestrictedAccess';
//         const inlinePolicyDocument = JSON.stringify({
//           Version: '2012-10-17',
//           Statement: [{
//             Sid: 'AllowEKSManagement',
//             Effect: 'Allow',
//             Action: ['eks:Describe*', 'eks:List*', 'eks:TagResource', 'eks:UntagResource'],
//             Resource: `arn:aws:eks:${REGION}:${cdk.Aws.ACCOUNT_ID}:cluster/${CLUSTER_NAME}`,
//           }],
//         });

//         await attachPolicies(roleName, policyArns, inlinePolicyName, inlinePolicyDocument);
//         if (authMode.includes('API')) {
//           await addAccessEntry(roleArn);
//         }

//         await sendRoleArnToCastAI(roleArn);
//         console.log(`Role ARN: ${roleArn} sent to CAST AI console successfully.`);
//       } catch (error) {
//         console.error('An error occurred:', error);
//       }
//     })();
//   }
// }

// const app = new cdk.App();
// new CastEksIntegrationStack(app, 'CastEksIntegrationStack');
