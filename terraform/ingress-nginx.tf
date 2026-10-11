resource "helm_release" "ingress_nginx" {
  depends_on       = [kind_cluster.liveboard]
  name             = "ingress-nginx"
  repository       = "https://kubernetes.github.io/ingress-nginx"
  chart            = "ingress-nginx"
  version          = var.ingress_nginx_version
  namespace        = "ingress-nginx"
  create_namespace = true
  wait             = true
  timeout          = 300

  values = [
    <<-EOT
    controller:
      hostPort:
        enabled: true
      nodeSelector:
        ingress-ready: "true"
      tolerations:
        - key: "node-role.kubernetes.io/control-plane"
          operator: "Equal"
          effect: "NoSchedule"
      publishService:
        enabled: false
      extraArgs:
        publish-status-address: "localhost"
      service:
        type: "NodePort"
    EOT
  ]
}
