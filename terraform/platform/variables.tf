##########################
# Global
##########################
variable "aws_region" {
  description = "AWS region to deploy resources in"
  type        = string
  default     = "eu-north-1"
}

variable "tags" {
  description = "Global tags to apply to all resources"
  type        = map(string)
  default     = {
    Environment = "dev"
    Terraform   = "true"
  }
}

##########################
# VPC
##########################
variable "vpc_cidr" {
  description = "CIDR for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "AZs to be used. Minimum 2 for EKS."
  type        = list(string)
  default     = ["eu-north-1a", "eu-north-1b"]
}

variable "public_subnets" {
  description = "Public subnets CIDR blocks. Placed in the first AZ only, for NAT Gateway/Load Balancer"
  type        = list(string)
  default     = ["10.0.1.0/24"]
}

variable "private_subnets" {
  description = "Private subnets CIDR blocks. 2 subnets across 2 AZs."
  type        = list(string)
  default     = ["10.0.2.0/24", "10.0.3.0/24"]
}

##########################
# EKS
##########################
variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "nodejs-cluster"
}

variable "cluster_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.29"
}

variable "node_group_name" {
  description = "Name for the EKS node group"
  type        = string
  default     = "eks_nodes"
}

variable "desired_capacity" {
  description = "Desired number of nodes in the node group"
  type        = number
  default     = 2
}

variable "min_capacity" {
  description = "Minimum number of nodes in the node group"
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum number of nodes in the node group"
  type        = number
  default     = 3
}

variable "instance_types" {
  description = "List of EC2 instance types for the node group"
  type        = list(string)
  default     = ["t3.medium"]
}
