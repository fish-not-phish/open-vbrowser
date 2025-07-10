output "task_definition_arns" {
  value = { for k, v in aws_ecs_task_definition.vbrowsers : k => v.arn }
}

output "task_definition_families" {
  value = { for k, v in aws_ecs_task_definition.vbrowsers : k => v.family }
}

output "log_group_names" {
  value = { for k, v in aws_cloudwatch_log_group.ecs : k => v.name }
}