output "vpc_id" {
  description = "ID of the vbrowser VPC"
  value       = aws_vpc.vbrowser.id
}

output "vpc_arn" {
  description = "ARN of the vbrowser VPC"
  value       = aws_vpc.vbrowser.arn
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value = [
    aws_subnet.public1.id,
    aws_subnet.public2.id,
  ]
}

output "public_subnet_arns" {
  description = "ARNs of the public subnets"
  value = [
    aws_subnet.public1.arn,
    aws_subnet.public2.arn,
  ]
}

output "security_group_id" {
  description = "ID of the vbrowser-sg Security Group"
  value       = aws_security_group.vbrowser_sg.id
}

output "security_group_arn" {
  description = "ARN of the vbrowser-sg Security Group"
  value       = aws_security_group.vbrowser_sg.arn
}

output "ecs_cluster_arn" {
  description = "ARN of the vbrowsers ECS Cluster"
  value       = aws_ecs_cluster.vbrowsers.arn
}

output "ecr_repository_url" {
  description = "URL of the vbrowsers ECR repository (for docker push/pull)"
  value       = aws_ecr_repository.vbrowsers.repository_url
}

output "ecr_repository_arn" {
  description = "ARN of the vbrowsers ECR repository"
  value       = aws_ecr_repository.vbrowsers.arn
}
