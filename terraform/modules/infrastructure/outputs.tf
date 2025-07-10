output "vpc_id" {
  value       = aws_vpc.vbrowser.id
}

output "vpc_arn" {
  value       = aws_vpc.vbrowser.arn
}

output "public_subnet_ids" {
  value       = aws_subnet.public[*].id
}

output "public_subnet_arns" {
  value       = aws_subnet.public[*].arn
}

output "security_group_id" {
  value       = aws_security_group.vbrowser_sg.id
}

output "security_group_arn" {
  value       = aws_security_group.vbrowser_sg.arn
}

output "ecs_cluster_arn" {
  value       = aws_ecs_cluster.vbrowsers.arn
}

output "ecs_cluster_name" {
  value       = aws_ecs_cluster.vbrowsers.name
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.vbrowsers.repository_url
}

output "ecr_repository_arn" {
  value       = aws_ecr_repository.vbrowsers.arn
}

output "ecs_task_execution_role_arn" {
  value       = aws_iam_role.ecs_task_execution_role.arn
}

output "vbrowser_user_access_key_id" {
  value       = aws_iam_access_key.vbrowser.id
}

output "vbrowser_user_secret_access_key" {
  value       = aws_iam_access_key.vbrowser.secret
  sensitive   = true
}