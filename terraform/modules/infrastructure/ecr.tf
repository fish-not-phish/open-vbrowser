resource "aws_ecr_repository" "vbrowsers" {
  name                 = var.ecr_repository_name
  image_tag_mutability = var.ecr_image_tag_mutability
  force_delete         = var.ecr_force_delete

  image_scanning_configuration {
    scan_on_push = var.ecr_scan_on_push
  }

  tags = merge(var.common_tags, {
    Name = var.ecr_repository_name
  })
}