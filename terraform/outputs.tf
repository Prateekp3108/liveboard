output "cluster_name" {
  description = "The name of the provisioned kind cluster"
  value       = kind_cluster.liveboard.name
}

output "cluster_endpoint" {
  description = "The Kubernetes API server endpoint"
  value       = kind_cluster.liveboard.endpoint
}

output "ingress_nginx_namespace" {
  description = "Namespace where ingress-nginx is deployed"
  value       = helm_release.ingress_nginx.namespace
}

output "argocd_namespace" {
  description = "Namespace where Argo CD is deployed"
  value       = helm_release.argocd.namespace
}

output "argocd_ingress_url" {
  description = "Local ingress URL for Argo CD"
  value       = "http://argocd.local"
}

output "argocd_admin_password_command" {
  description = "Command to retrieve the Argo CD initial admin password"
  value       = "kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath=\"{.data.password}\" | base64 -d && echo"
}
