resource "aws_security_group" "vbrowser_sg" {
  name        = "${var.project_name}-sg"
  description = var.security_group_description
  vpc_id      = aws_vpc.vbrowser.id

  ingress {
    from_port        = var.http_port
    to_port          = var.http_port
    protocol         = "tcp"
    cidr_blocks      = var.allowed_cidr_blocks
    ipv6_cidr_blocks = var.allowed_ipv6_cidr_blocks
  }

  ingress {
    from_port        = var.https_port
    to_port          = var.https_port
    protocol         = "tcp"
    cidr_blocks      = var.allowed_cidr_blocks
    ipv6_cidr_blocks = var.allowed_ipv6_cidr_blocks
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = var.allowed_cidr_blocks
    ipv6_cidr_blocks = var.allowed_ipv6_cidr_blocks
  }

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-sg"
  })
}