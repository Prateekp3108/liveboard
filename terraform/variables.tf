variable "cluster_name" {
  description = "The name of the local kind Kubernetes cluster"
  type        = string
  default     = "liveboard-cluster"
}

variable "kind_node_image" {
  description = "Pinned Kubernetes node image version for kind"
  type        = string
  default     = "kindest/node:v1.32.2"
}

variable "ingress_nginx_version" {
  description = "Pinned Helm chart version for ingress-nginx"
  type        = string
  default     = "4.15.1"
}

variable "argocd_version" {
  description = "Pinned Helm chart version for Argo CD"
  type        = string
  default     = "10.10.2"
}
