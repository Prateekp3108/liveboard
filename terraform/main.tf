resource "kind_cluster" "liveboard" {
  name           = var.cluster_name
  node_image     = var.kind_node_image
  wait_for_ready = true

  kind_config {
    kind        = "Cluster"
    api_version = "kind.x-k8s.io/v1alpha4"

    node {
      role = "control-plane"

      kubeadm_config_patches = [
        "kind: InitConfiguration\nnodeRegistration:\n  kubeletExtraArgs:\n    node-labels: \"ingress-ready=true\"\n"
      ]

      extra_port_mappings {
        container_port = 80
        host_port      = 80
        protocol       = "TCP"
      }

      extra_port_mappings {
        container_port = 443
        host_port      = 443
        protocol       = "TCP"
      }
    }
  }
}

provider "kubernetes" {
  host                   = kind_cluster.liveboard.endpoint
  client_certificate     = kind_cluster.liveboard.client_certificate
  client_key             = kind_cluster.liveboard.client_key
  cluster_ca_certificate = kind_cluster.liveboard.cluster_ca_certificate
}

provider "helm" {
  kubernetes {
    host                   = kind_cluster.liveboard.endpoint
    client_certificate     = kind_cluster.liveboard.client_certificate
    client_key             = kind_cluster.liveboard.client_key
    cluster_ca_certificate = kind_cluster.liveboard.cluster_ca_certificate
  }
}
