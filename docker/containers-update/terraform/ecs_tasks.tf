resource "aws_cloudwatch_log_group" "ecs" {
  for_each = toset(var.docker_images)

  name              = "/ecs/vbrowser/${each.key}"
  retention_in_days = 30
  tags = {
    Service = "vbrowsers"
    Task    = each.key
  }
}

resource "aws_ecs_task_definition" "vbrowsers" {
  for_each = toset(var.docker_images)

  family                   = each.key
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "2048"
  execution_role_arn       = var.ecs_execution_role_arn
  task_role_arn            = var.ecs_task_role_arn

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = "${var.ecr_registry}:${each.key}"
      essential = true
      cpu       = 0

      portMappings = [
        {
          name          = "${each.key}-443-tcp"
          containerPort = 443
          hostPort      = 443
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "PUID", value = "1000" },
        { name = "PGID", value = "1000" },
        { name = "TZ",   value = "Etc/UTC" }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs[each.key].name
          awslogs-region        = "us-east-1"
          awslogs-stream-prefix = "ecs"
          mode                  = "non-blocking"
          max-buffer-size       = "25m"
        }
      }
    }
  ])
}
