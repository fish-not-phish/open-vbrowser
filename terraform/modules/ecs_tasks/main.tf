resource "aws_cloudwatch_log_group" "ecs" {
  for_each = toset(var.docker_images)

  name              = "/ecs/${var.project_name}/${each.key}"
  retention_in_days = var.log_retention_days

  tags = merge(var.common_tags, {
    Task = each.key
  })
}

locals {
  # Resolve effective cpu/memory for each image — use override if present, else default.
  task_cpu_map = {
    for img in var.docker_images :
    img => try(var.task_resource_overrides[img].cpu, var.task_cpu)
  }
  task_memory_map = {
    for img in var.docker_images :
    img => try(var.task_resource_overrides[img].memory, var.task_memory)
  }
}

resource "aws_ecs_task_definition" "browsers" {
  for_each = toset(var.docker_images)

  family                   = "${var.project_name}-${each.key}"
  requires_compatibilities = var.requires_compatibilities
  network_mode             = var.network_mode
  cpu                      = local.task_cpu_map[each.key]
  memory                   = local.task_memory_map[each.key]
  execution_role_arn       = var.ecs_execution_role_arn
  task_role_arn            = var.ecs_task_role_arn

  runtime_platform {
    cpu_architecture        = var.cpu_architecture
    operating_system_family = var.operating_system_family
  }

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = "${var.ecr_registry}:${each.key}"
      essential = var.container_essential
      cpu       = var.container_cpu

      portMappings = [
        {
          name          = "${each.key}-${var.container_port}-${var.port_protocol}"
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = var.port_protocol
        }
      ]

      environment = var.environment_variables

      logConfiguration = {
        logDriver = var.log_driver
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs[each.key].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = var.log_stream_prefix
          mode                  = var.log_mode
          max-buffer-size       = var.log_max_buffer_size
        }
      }
    }
  ])

  tags = merge(var.common_tags, {
    Task = each.key
  })
}
