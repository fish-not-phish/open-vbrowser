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
