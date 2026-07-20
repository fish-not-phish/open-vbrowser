output "task_definition_arns" {
  description = "Map of image name → task definition ARN"
  value       = { for k, v in aws_ecs_task_definition.browsers : k => v.arn }
}

output "task_definition_families" {
  description = "Map of image name → task definition family"
  value       = { for k, v in aws_ecs_task_definition.browsers : k => v.family }
}

output "log_group_names" {
  description = "Map of image name → CloudWatch log group name"
  value       = { for k, v in aws_cloudwatch_log_group.ecs : k => v.name }
}
