variable "aws_region" {
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  type        = string
  default     = "vbrowser"
}

variable "cluster_name" {
  type        = string
  default     = "vbrowsers"
}

variable "vpc_cidr" {
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  type        = list(string)
  default     = ["10.0.0.0/24", "10.0.1.0/24"]
}

variable "enable_dns_support" {
  type    = bool
  default = true
}

variable "enable_dns_hostnames" {
  type    = bool
  default = true
}

variable "map_public_ip_on_launch" {
  type    = bool
  default = true
}

variable "internet_gateway_route_cidr" {
  type    = string
  default = "0.0.0.0/0"
}

variable "security_group_description" {
  type    = string
  default = "Allow HTTP/HTTPS inbound; all outbound"
}

variable "http_port" {
  type    = number
  default = 80
}

variable "https_port" {
  type    = number
  default = 443
}

variable "allowed_cidr_blocks" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}

variable "allowed_ipv6_cidr_blocks" {
  type    = list(string)
  default = ["::/0"]
}

variable "ecr_repository_name" {
  type        = string
  default     = "vbrowsers"
}

variable "ecr_image_tag_mutability" {
  type        = string
  default     = "MUTABLE"
}

variable "ecr_scan_on_push" {
  type        = bool
  default     = false
}

variable "ecr_force_delete" {
  type    = bool
  default = true
}

variable "iam_user_name" {
  type        = string
  default     = "vbrowser-user"
}

variable "iam_user_path" {
  type    = string
  default = "/"
}

variable "ecs_task_role_name" {
  type        = string
  default     = "ecsTaskRole"
}

variable "iam_policy_version" {
  type    = string
  default = "2012-10-17"
}

variable "ecs_service_principal" {
  type    = string
  default = "ecs-tasks.amazonaws.com"
}

variable "ecs_task_execution_policy_name" {
  type    = string
  default = "ecsTaskExecutionAllowCloudWatch"
}

variable "aws_ecs_task_execution_role_policy_arn" {
  type    = string
  default = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

variable "aws_readonly_access_policy_arn" {
  type    = string
  default = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

variable "ecr_policy_suffix" {
  type    = string
  default = "ecr-push"
}

variable "ecs_task_defs_policy_suffix" {
  type    = string
  default = "ecs-task-definitions"
}

variable "logs_policy_suffix" {
  type    = string
  default = "logs"
}

variable "container_insights_enabled" {
  type        = bool
  default     = false
}

variable "capacity_providers" {
  type        = list(string)
  default     = ["FARGATE", "FARGATE_SPOT"]
}

variable "default_capacity_provider" {
  type        = string
  default     = "FARGATE"
}

variable "capacity_provider_weight" {
  type    = number
  default = 1
}

variable "common_tags" {
  type        = map(string)
  default = {
    Project     = "vbrowser"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}