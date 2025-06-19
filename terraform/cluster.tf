resource "aws_ecs_cluster" "vbrowsers" {
  name = "vbrowsers"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "vbrowsers" {
  cluster_name       = aws_ecs_cluster.vbrowsers.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}