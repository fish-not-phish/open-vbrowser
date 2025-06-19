data "aws_availability_zones" "available" {}

resource "aws_vpc" "vbrowser" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "vbrowser-vpc"
  }
}

resource "aws_subnet" "public1" {
  vpc_id                  = aws_vpc.vbrowser.id
  cidr_block              = "10.0.0.0/24"
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = {
    Name = "vbrowser-subnet-public1-${data.aws_availability_zones.available.names[0]}"
  }
}

resource "aws_subnet" "public2" {
  vpc_id                  = aws_vpc.vbrowser.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = data.aws_availability_zones.available.names[1]
  map_public_ip_on_launch = true

  tags = {
    Name = "vbrowser-subnet-public1-${data.aws_availability_zones.available.names[1]}"
  }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.vbrowser.id

  tags = {
    Name = "vbrowser-igw"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.vbrowser.id

  tags = {
    Name = "vbrowser-rtb-public"
  }
}

resource "aws_route" "internet_access" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.igw.id
}

resource "aws_route_table_association" "public1" {
  subnet_id      = aws_subnet.public1.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public2" {
  subnet_id      = aws_subnet.public2.id
  route_table_id = aws_route_table.public.id
}
