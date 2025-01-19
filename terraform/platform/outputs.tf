##########################
# VPC Outputs
##########################
output "vpc_id" {
  description = "ID of the created VPC"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = module.vpc.public_subnets
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = module.vpc.private_subnets
}

##########################
# EKS Outputs
##########################
output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_id
}

output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_security_group_id" {
  description = "EKS cluster security group ID"
  value       = module.eks.cluster_security_group_id
}

output "node_group_name" {
  description = "Node group name"
  value       = aws_eks_node_group.managed_nodes.node_group_name
}

output "node_group_arn" {
  description = "Node group ARN"
  value       = aws_eks_node_group.managed_nodes.arn
}
