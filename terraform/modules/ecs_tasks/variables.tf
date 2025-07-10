variable "docker_images" {
  type = list(string)
}

variable "ecr_registry" {
  type = string
}

variable "ecs_task_role_arn" {
  type = string
}

variable "ecs_execution_role_arn" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "project_name" {
  type    = string
  default = "vbrowser"
}

variable "task_cpu" {
  type    = string
  default = "512"
}

variable "task_memory" {
  type    = string
  default = "2048"
}

variable "container_port" {
  type    = number
  default = 443
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "cpu_architecture" {
  type    = string
  default = "X86_64"
}

variable "operating_system_family" {
  type    = string
  default = "LINUX"
}

variable "log_driver" {
  type    = string
  default = "awslogs"
}

variable "log_mode" {
  type    = string
  default = "non-blocking"
}

variable "log_max_buffer_size" {
  type    = string
  default = "25m"
}

variable "log_stream_prefix" {
  type    = string
  default = "ecs"
}

variable "requires_compatibilities" {
  type    = list(string)
  default = ["FARGATE"]
}

variable "network_mode" {
  type    = string
  default = "awsvpc"
}

variable "container_essential" {
  type    = bool
  default = true
}

variable "container_cpu" {
  type    = number
  default = 0
}

variable "port_protocol" {
  type    = string
  default = "tcp"
}

variable "environment_variables" {
  type = list(object({
    name  = string
    value = string
  }))
  default = [
    { name = "PUID", value = "1000" },
    { name = "PGID", value = "1000" },
    { name = "TZ", value = "Etc/UTC" }
  ]
}

variable "common_tags" {
  type = map(string)
  default = {
    Service = "vbrowsers"
  }
}