output "vpc_id" {
  value = aws_vpc.ovb.id
}

output "vpc_arn" {
  value = aws_vpc.ovb.arn
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "public_subnet_arns" {
  value = aws_subnet.public[*].arn
}

output "security_group_id" {
  value = aws_security_group.ovb_sg.id
}

output "security_group_arn" {
  value = aws_security_group.ovb_sg.arn
}

output "ecs_cluster_arn" {
  value = aws_ecs_cluster.browsers.arn
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.browsers.name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.browsers.repository_url
}

output "ecr_repository_arn" {
  value = aws_ecr_repository.browsers.arn
}

output "ecs_task_execution_role_arn" {
  value = aws_iam_role.ecs_task_execution_role.arn
}

output "ecs_task_role_arn" {
  value = aws_iam_role.ecs_task_role.arn
}

output "ovb_user_access_key_id" {
  value = aws_iam_access_key.ovb.id
}

output "ovb_user_secret_access_key" {
  sensitive = true
  value     = aws_iam_access_key.ovb.secret
}


