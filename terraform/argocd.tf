resource "helm_release" "argocd" {
  depends_on       = [helm_release.ingress_nginx]
  name             = "argocd"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  version          = var.argocd_version
  namespace        = "argocd"
  create_namespace = true
  wait             = true
  timeout          = 600

  values = [
    <<-EOT
    server:
      extraArgs:
        - --insecure
      ingress:
        enabled: true
        ingressClassName: nginx
        hostname: argocd.local
        paths:
          - /
        pathType: Prefix
    configs:
      params:
        server.insecure: true
    EOT
  ]
}
