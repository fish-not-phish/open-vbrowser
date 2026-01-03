resource "aws_cloudformation_stack" "soci_index_builder" {
  count = var.enable_soci_indexing ? 1 : 0

  name          = var.soci_stack_name
  template_body = file("${path.module}/soci-index-builder.yaml")

  parameters = {
    SociRepositoryImageTagFilters = var.soci_image_tag_filters
    QSS3BucketName                = var.soci_s3_bucket
    QSS3KeyPrefix                 = var.soci_s3_key_prefix
    IamPermissionsBoundaryArn     = var.soci_iam_permissions_boundary
  }

  capabilities = var.soci_capabilities

  tags = merge(var.common_tags, {
    Name = var.soci_stack_name
  })
}