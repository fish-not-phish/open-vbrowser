resource "aws_cloudformation_stack" "soci_index_builder" {
  count = var.enable_soci_indexing ? 1 : 0

  name          = var.soci_stack_name
  template_body = file("${path.module}/soci-index-builder.yaml")
  capabilities  = var.soci_capabilities

  parameters = {
    SociRepositoryImageTagFilters = var.soci_image_tag_filters
    QSS3BucketName                = var.soci_s3_bucket
    QSS3KeyPrefix                 = var.soci_s3_key_prefix
    IamPermissionsBoundaryArn     = var.soci_iam_permissions_boundary != "none" ? var.soci_iam_permissions_boundary : "none"
  }

  tags = var.common_tags
}
