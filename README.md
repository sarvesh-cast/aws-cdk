# aws-cdk

# AWS Typescript CDK - CAST AI Phase 2 onboarding script

## Environment Setup
Dependency: AWS Typescript CDK V2
Boostrap cdk env using : cdk init app --language typescript
Configure app: "app": "npx ts-node --prefer-ts-exts ph2_onboard.ts",

The CAST AI Phase 2 onboarding script creates following AWS resources 
1. CAST EC2 Instance profile
2. CAST Cluster role
3. CAST EKS node security group
4. Access entry for EKS cluster 
5. Post call to CAST API using lambda

## EKS and CAST AI example for onboarding flow

## CDK-GitOps flow 

AWS CDK Managed ==>  IAM roles, CAST AI Node Configuration, CAST Node Templates and CAST Autoscaler policies

Helm Managed ==>  All Castware components such as `castai-agent`, `castai-cluster-controller`, `castai-evictor`, `castai-spot-handler`, `castai-kvisor`, `castai-workload-autoscaler`, `castai-pod-pinner`, `castai-egressd` are to be installed using other means (e.g ArgoCD, manual Helm releases, etc.)


                                                +-------------------------+
                                                |         Start           |
                                                +-------------------------+
                                                            |
                                                            | 
                                                            | AWS CLI
                                                +-------------------------+
                                                | 1.Check EKS Auth Mode is API OR API_CONFIGMAP
                                                | 
                                                +-------------------------+
                                                            |
                                                            | 
                                    -----------------------------------------------------
                                    | YES                                               | NO
                                    |                                                   |
                        +-------------------------+                      +-----------------------------------------+
                        1.No action needed from User                     2. User to add cast role in aws-auth configmap
                        
                        +-------------------------+                      +-----------------------------------------+
                                    |                                                   |
                                    |                                                   |
                                    -----------------------------------------------------
                                                            | 
                                                            | 
                                                            | AWS CDK
                                                +-------------------------+
                                                | 3. Update variable.ts (Required values can be obtained from CAST Console UI - Enable CAST AI button)
                                                  4. Run cdk synth --all (Verify vars such as region,cluster etc)
                                                  5. Run cdk deploy --all 
                                                +-------------------------+
                                                            | 
                                                            | 
                                                            |GITOPS
                                                +-------------------------+
                                                | 6. Deploy Helm chart of castai-agent castai-cluster-controller`, `castai-evictor`, `castai-spot-handler`, `castai-kvisor`, `castai-workload-autoscaler`, `castai-pod-pinner`
                                                +-------------------------+         
                                                            | 
                                                            | 
                                                +-------------------------+
                                                |         END             |
                                                +-------------------------+


Prerequisites:
- CAST AI account
- Obtained CAST AI Key [API Access key](https://docs.cast.ai/docs/authentication#obtaining-api-access-key) with Full Access


### Step 1: Get EKS cluster authentication mode
```
CLUSTER_NAME=""
REGION="" 
current_auth_mode=$(aws eks describe-cluster --name $CLUSTER_NAME --region $REGION | grep authenticationMode | awk '{print $2}') 
echo "Authentication mode is $current_auth_mode"
```


### Step 2: If EKS AUTH mode is API/API_CONFIGMAP, This step can be SKIPPED.
#### User to add cast role in aws-auth configmap, configmap may have other entries, so add the below role to it.
```
apiVersion: v1
data:
  mapRoles: |
    - rolearn: arn:aws:iam::<accountid>:role/cast-eks-instance-<clustername>
      username: system:node:{{EC2PrivateDNSName}}
      groups:
      - system:bootstrappers
      - system:nodes
kind: ConfigMap
metadata:
  name: aws-auth
  namespace: kube-system
```

### Step 3 : Update variables in variable.ts 

Update below values in variable.ts. These values can be obtained from CAST CONSOLE UI - Enable CAST AI button and your EKS Cluster details:
```
ClusterName:
ClusterVpcId:
CastAiClusterId:
CastApiKey:

Run cdk synth --all (Verify vars such as region,cluster etc)
```

### Step 4: Run cdk synth --all
```
Execute cdk synth --all, Post successful Plan - Verify region/cluster etc
```

### Step 5: Run cdk deploy --all
```
Execute cdk deploy --all, Post successful apply - CAST Console UI will be in `Connecting` state.
```

### Step 6: Deploy Helm chart of CAST Components
Coponents: `castai-cluster-controller`,`castai-evictor`, `castai-spot-handler`, `castai-kvisor`, `castai-workload-autoscaler`, `castai-pod-pinner` \
After all CAST AI components are installed in the cluster its status in CAST AI console would change from `Connecting` to `Connected` which means that cluster onboarding process completed successfully.

```
CASTAI_API_KEY="<Replace cluster_token>"
CASTAI_CLUSTER_ID="<Replace cluster_id>"
CAST_CONFIG_SOURCE="castai-cluster-controller"

#### Mandatory Component: Castai-agent
helm upgrade -i castai-agent castai-helm/castai-agent -n castai-agent --create-namespace \
  --set apiKey=$CASTAI_API_KEY \
  --set provider=eks \
  --set createNamespace=false

#### Mandatory Component: castai-cluster-controller
helm upgrade -i cluster-controller castai-helm/castai-cluster-controller -n castai-agent \
--set castai.apiKey=$CASTAI_API_KEY \
--set castai.clusterID=$CASTAI_CLUSTER_ID \
--set autoscaling.enabled=true

#### castai-spot-handler
helm upgrade -i castai-spot-handler castai-helm/castai-spot-handler -n castai-agent \
--set castai.clusterID=$CASTAI_CLUSTER_ID \
--set castai.provider=aws

#### castai-evictor
helm upgrade -i castai-evictor castai-helm/castai-evictor -n castai-agent --set replicaCount=1

#### castai-pod-pinner
helm upgrade -i castai-pod-pinner castai-helm/castai-pod-pinner -n castai-agent \
--set castai.apiKey=$CASTAI_API_KEY \
--set castai.clusterID=$CASTAI_CLUSTER_ID \
--set replicaCount=0

#### castai-workload-autoscaler
helm upgrade -i castai-workload-autoscaler castai-helm/castai-workload-autoscaler -n castai-agent \
--set castai.apiKeySecretRef=$CAST_CONFIG_SOURCE \
--set castai.configMapRef=$CAST_CONFIG_SOURCE \

#### castai-kvisor
helm upgrade -i castai-kvisor castai-helm/castai-kvisor -n castai-agent \
--set castai.apiKey=$CASTAI_API_KEY \
--set castai.clusterID=$CASTAI_CLUSTER_ID \
--set controller.extraArgs.kube-linter-enabled=true \
--set controller.extraArgs.image-scan-enabled=true \
--set controller.extraArgs.kube-bench-enabled=true \
--set controller.extraArgs.kube-bench-cloud-provider=eks
```

## Steps Overview

1. If EKS auth mode is not API/API_CONFIGMAP - Update [aws-auth](https://docs.aws.amazon.com/eks/latest/userguide/add-user-role.html) configmap with instance profile used by CAST AI. This instance profile is used by CAST AI managed nodes to communicate with EKS control plane.  Example of entry can be found [here](https://github.com/castai/terraform-provider-castai/blob/157babd57b0977f499eb162e9bee27bee51d292a/examples/eks/eks_cluster_assumerole/eks.tf#L28-L38).
2. Configure `variable.ts` file with required values.
3. Run `cdk deploy --all`. At this stage you would see that your cluster is in `Connecting` state in CAST AI console
4. Install CAST AI components using Helm. Use `cluster_id` and `api_key` values to configure Helm releases:
- Set `castai.apiKey` property to `api_key`
- Set `castai.clusterID` property to `cluster_id`
5. After all CAST AI components are installed in the cluster its status in CAST AI console would change from `Connecting` to `Connected` which means that cluster onboarding process completed successfully.