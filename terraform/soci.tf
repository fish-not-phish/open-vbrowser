resource "aws_cloudformation_stack" "soci_index_builder" {
  name          = "soci-index-builder"
  template_body = file("${path.module}/soci-index-builder.yaml")

  parameters = {
    SociRepositoryImageTagFilters = "*:*"
    QSS3BucketName                = "aws-quickstart"
    QSS3KeyPrefix                 = "cfn-ecr-aws-soci-index-builder/"
    IamPermissionsBoundaryArn     = "none"
  }

  capabilities = ["CAPABILITY_NAMED_IAM"]
}
