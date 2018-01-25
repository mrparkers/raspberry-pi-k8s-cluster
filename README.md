# Raspberry Pi Kubernetes Cluster

Build your own Kubernetes cluster using a few Raspberry Pis.

![](https://i.imgur.com/4KHngfW.jpg)

## Shopping List

| Name                           | Amazon Link                          |
|--------------------------------|--------------------------------------|
| Raspberry Pi 3 Model B (x4)    | https://www.amazon.com/dp/B01CD5VC92 |
| Raspberry Pi Dog Bone Case     | https://www.amazon.com/dp/B00MYFAAPO |
| SD Cards                       | https://www.amazon.com/dp/B013P27MDW |
| Power Bank & Micro USB Cables  | https://www.amazon.com/dp/B00WI2DN4S |
| Network Switch                 | https://www.amazon.com/dp/B008PC1FYK |
| Network Switch USB Power Cable | https://www.amazon.com/dp/B009JXJITS |
| Ethernet Cables                | https://www.amazon.com/dp/B01IQWGKQ6 |

## Initial Setup

I decided to use [HypriotOS](https://blog.hypriot.com/) since it makes using Docker on ARM extremely easy.

You can flash an image of HypriotOS to each of your SD cards using using [hypriot/flash](https://github.com/hypriot/flash).
Use the `--hostname` flag to set the desired hostname for each of your Pis.

```bash
flash --hostname rpi-master https://github.com/hypriot/image-builder-rpi/releases/download/v1.7.1/hypriotos-rpi-v1.7.1.img.zip
flash --hostname rpi-node-1 https://github.com/hypriot/image-builder-rpi/releases/download/v1.7.1/hypriotos-rpi-v1.7.1.img.zip
flash --hostname rpi-node-2 https://github.com/hypriot/image-builder-rpi/releases/download/v1.7.1/hypriotos-rpi-v1.7.1.img.zip
flash --hostname rpi-node-3 https://github.com/hypriot/image-builder-rpi/releases/download/v1.7.1/hypriotos-rpi-v1.7.1.img.zip
```

After inserting your newly formatted SD cards and powering on your cluster, you can attempt to ssh to each Pi to verify it is up and running.
The default root user is `pirate`, and the password is `hypriot`.

```bash
ssh pirate@rpi-master
ssh pirate@rpi-node-1
ssh pirate@rpi-node-2
ssh pirate@rpi-node-3
```

After logging in to each Pi, you can create a new user with `sudo` access like so:

```bash
sudo adduser michael
sudo usermod -aG sudo michael
su - michael # Verify user has sudo
```

Then you can disable the default root account:

```bash
sudo passwd -l pirate
```

## Assign Static IP Addresses

This is entirely optional, I just feel better knowing the IP address of each of my Pis off the top of my head.

To configure a static IP address, update the `eth0` interface on each of your Pis with the desired addresses and your network's default gateway.

```bash
sudo vi /etc/network/interfaces.d/eth0
```

```
allow-hotplug eth0
iface eth0 inet static
    address 192.168.50.10
    netmask 255.255.255.0
    gateway 192.168.50.1
```

Restart the `networking` service for the changes to take effect:

```bash
service networking restart
```

Once you're done assigning static IP addresses, update the hosts file on each Pi:

```bash
sudo vi /etc/hosts
```

```
192.168.50.10 rpi-master rpi-master.local
192.168.50.11 rpi-node-1 rpi-node-1.local
192.168.50.12 rpi-node-2 rpi-node-2.local
192.168.50.13 rpi-node-3 rpi-node-3.local
```

## SSH Keys

I don't like entering in my password every time I want to SSH to each node in my cluster, so I created some SSH keys to allow for passwordless login.

First, create a `.ssh` folder in your user's home directory for each pi:

```bash
cd ~
install -d -m 700 ~/.ssh
```

Then, on your local machine, create an SSH key pair:

```bash
ssh-keygen -t rsa -C "michael@rpi*.local"
```

Once that's done, add this key to your SSH agent:

```bash
eval "$(ssh-agent -s)"
ssh-add -K ~/.ssh/id_rsa_rpi
```

Finally, add the new key to each Pi's `authorized_keys`:

```bash
cat ~/.ssh/id_rsa_rpi.pub | ssh michael@rpi-master 'cat >> .ssh/authorized_keys'
cat ~/.ssh/id_rsa_rpi.pub | ssh michael@rpi-node-1 'cat >> .ssh/authorized_keys'
cat ~/.ssh/id_rsa_rpi.pub | ssh michael@rpi-node-2 'cat >> .ssh/authorized_keys'
cat ~/.ssh/id_rsa_rpi.pub | ssh michael@rpi-node-3 'cat >> .ssh/authorized_keys'
```

## Setup Kubernetes

Install `kubeadm` on each node:

```bash
curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add -
echo "deb http://apt.kubernetes.io/ kubernetes-xenial main" > /etc/apt/sources.list.d/kubernetes.list
apt-get update
apt-get install -y kubeadm
```

On your master node, run `kubeadm init` to setup the Kubernetes master.  The `--pod-networking-cidr` flag is required since I'm going to use Flannel for the cluster's networking.

```bash
kubeadm init --pod-network-cidr 10.244.0.0/16
```

The output of running this command will contain some `kubeadm join` commands.  Copy these and run them on the three nodes.

Once that's done, install flannel by running the following on the master:

```bash
curl -sSL https://raw.githubusercontent.com/coreos/flannel/v0.9.1/Documentation/kube-flannel.yml | sed "s/amd64/arm/g" | kubectl create -f -
```

When this is finished, you should be able to see each of your nodes in a ready state:

```bash
HypriotOS/armv7: michael@rpi-master in ~
$ kubectl get nodes
NAME         STATUS    ROLES     AGE       VERSION
rpi-master   Ready     master    7m        v1.9.1
rpi-node-1   Ready     <none>    1m        v1.9.1
rpi-node-2   Ready     <none>    56s       v1.9.1
rpi-node-3   Ready     <none>    1m        v1.9.1
```

If you want to use `kubectl` to access your cluster from another machine, you'll need to copy the configuration file generated by `kubeadm init` on your master node, which can
be found at `/etc/kubernetes/admin.conf`. I went ahead and added the cluster, context, and user from the `admin.conf` file to my local `~/.kube/config` and renamed the context
to `rpi`, so I can switch to this context by running:

```bash
kubectl config use-context rpi
```


## Using Your Cluster

One thing to keep in mind when running containers on your cluster is that the CPU architecture of your cluster is ARM as opposed to x86/x64, meaning the
containers you run need to support multiple architectures, or be built specifically for ARM.  One of the reasons I chose Flannel for the cluster networking
is because there aren't a lot of great alternatives that support ARM.

I created a simple hello world application that you can use to test our your cluster's functionality.  You can deploy it to your cluster using the included
manifest file:

```bash
kubectl apply -f hello-world.yml
```

Once this is finished, you should be able to see this application by accessing it from a node in your cluster:

```bash
HypriotOS/armv7: michael@rpi-master in ~
$ kubectl get service
NAME          TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
hello-world   ClusterIP   10.102.151.30   <none>        5555/TCP   14d
kubernetes    ClusterIP   10.96.0.1       <none>        443/TCP    17d
HypriotOS/armv7: michael@rpi-master in ~
$ curl -I 10.102.151.30:5555
HTTP/1.1 200 OK
content-type: text/html; charset=utf-8
cache-control: no-cache
content-length: 12
Date: Thu, 25 Jan 2018 03:58:15 GMT
Connection: keep-alive
```

You can access this app from outside your cluster in a few different ways.

A simple way would be to change the type of the `hello-world` service to a `NodePort`, which will expose your service on a port between 30000-32767, and each node in your cluster will proxy that port to your service.

Instead of doing this, I decided to use Ingress resources so I have more control over the way services are exposed from my cluster.
I decided to use [Traefik](https://github.com/containous/traefik) for this since their image is built with multi-architecture support,
meaning it will work in my cluster.

Unlike the behavior of a `NodePort`, I only want one of my nodes to expose services in my cluster. This means that when I deploy Traefik, I only want the cluster to schedule its pods on
a particular node as opposed to picking from the three that are available.  An easy way to do this is to add a label to the node you want to use and use `nodeSelector` to target
the node with that label.

```bash
kubectl label node rpi-node-1 ingress-controller=traefik
```

Finally, when I make my Traefik deployment, I want to set `hostNetwork` to `true` so its pods can access the network interfaces of my designated ingress controller node.

You can deploy Traefik to your cluster using the included manifest file:

```bash
kubectl apply -f traefik.yml
```

Once this is finished, the Ingress resource created in `hello-world.yml` will be fulfilled by Traefik, which will redirect incoming traffic to the `hello-world` service on port 5555.

```bash
$ curl rpi-node-1
Hello World!
```
