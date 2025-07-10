output "vpc_id" {
  value       = module.infrastructure.vpc_id
}

output "vpc_arn" {
  value       = module.infrastructure.vpc_arn
}

output "public_subnet_ids" {
  value       = module.infrastructure.public_subnet_ids
}

output "public_subnet_arns" {
  value       = module.infrastructure.public_subnet_arns
}

output "security_group_id" {
  value       = module.infrastructure.security_group_id
}

output "security_group_arn" {
  value       = module.infrastructure.security_group_arn
}

output "ecs_cluster_arn" {
  value       = module.infrastructure.ecs_cluster_arn
}

output "ecs_cluster_name" {
  value       = module.infrastructure.ecs_cluster_name
}

output "ecr_repository_url" {
  value       = module.infrastructure.ecr_repository_url
}

output "ecr_repository_arn" {
  value       = module.infrastructure.ecr_repository_arn
}

output "ecs_task_execution_role_arn" {
  value       = module.infrastructure.ecs_task_execution_role_arn
}

output "vbrowser_user_access_key_id" {
  value       = module.infrastructure.vbrowser_user_access_key_id
}

output "vbrowser_user_secret_access_key" {
  value       = module.infrastructure.vbrowser_user_secret_access_key
  sensitive   = true
}

output "task_definition_arns" {
  value       = module.ecs_tasks.task_definition_arns
}

output "task_definition_families" {
  value       = module.ecs_tasks.task_definition_families
}

output "log_group_names" {
  value       = module.ecs_tasks.log_group_names
}