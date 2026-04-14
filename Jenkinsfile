pipeline {
  agent {
    label 'worker1'
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  triggers {
    githubPush()
  }

  environment {
    DOCKER_IMAGE_NAME = 'dittopedia-docs'
    DOCKER_CREDENTIALS_ID = 'dockerhub-creds'
    AWS_CREDENTIALS_ID = 'aws-deploy-creds'
    EC2_SSH_CREDENTIALS_ID = 'ec2-staging-ssh'
    SSH_INGRESS_CIDR_CREDENTIALS_ID = 'ssh-ingress-cidr-default'
    INFRA_REPO_URL = 'https://github.com/Dittoploy/dittopedia-infra.git'
    INFRA_REPO_BRANCH = 'staging-aws-1'
    AWS_REGION = 'eu-west-3'
    EC2_INSTANCE_NAME = 'dittopedia-docs-staging'
    EC2_INSTANCE_TYPE = 't3.small'
    EC2_KEY_NAME = 'dittopedia-jenkins-key'
    EC2_SSH_USER = 'ubuntu'
    WORKER_DEPLOY_KEY_PATH = '/var/jenkins/.ssh/dittopedia_deploy_key.pem'
    SSH_INGRESS_CIDR_EFFECTIVE = ''
    SONARQUBE_ENV = 'sonarqube'
    SONAR_PROJECT_KEY = 'dittopedia-docs'
    SONAR_PROJECT_NAME = 'dittopedia-docs'
    ENABLE_SONAR = 'false'
  }

  stages {
    stage('Resolve SSH ingress CIDR') {
      when {
        expression {
          def branchName = env.BRANCH_NAME ?: ''
          def gitBranch = env.GIT_BRANCH ?: ''
          return branchName == 'staging-aws-1' || gitBranch.endsWith('/staging-aws-1')
        }
      }
      steps {
        script {
          def resolvedCidr = ''

          withCredentials([string(credentialsId: "${SSH_INGRESS_CIDR_CREDENTIALS_ID}", variable: 'SSH_INGRESS_CIDR_DEFAULT')]) {
            def defaultCidr = env.SSH_INGRESS_CIDR_DEFAULT?.trim()
            resolvedCidr = defaultCidr ?: ''
            echo "Credential default CIDR present: ${defaultCidr ? 'yes' : 'no'}"
          }

          if (!resolvedCidr) {
            error('Credential ssh-ingress-cidr-default is empty or unavailable. Set a valid CIDR (for example x.x.x.x/32).')
          }

          writeFile file: '.ssh_ingress_cidr', text: "${resolvedCidr}\n"
          env.SSH_INGRESS_CIDR_EFFECTIVE = resolvedCidr

          echo 'SSH ingress CIDR resolved from Jenkins credential default.'
        }
      }
    }

    stage('Validate SSH ingress CIDR') {
      when {
        expression {
          def branchName = env.BRANCH_NAME ?: ''
          def gitBranch = env.GIT_BRANCH ?: ''
          return branchName == 'staging-aws-1' || gitBranch.endsWith('/staging-aws-1')
        }
      }
      steps {
        script {
          def cidr = readFile('.ssh_ingress_cidr').trim()
          if (cidr == '0.0.0.0/0') {
            error('SSH_INGRESS_CIDR must not be 0.0.0.0/0. Restrict SSH access to a trusted source CIDR.')
          }
        }
      }
    }

    stage('Install') {
      steps {
        sh '''
          node -v
          if command -v bun >/dev/null 2>&1; then bun -v; fi

          NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
          if [ "$NODE_MAJOR" -lt 18 ]; then
            echo "Node.js >= 18 is required for Next.js 15 (current: $(node -v))" >&2
            exit 1
          fi

          if [ -x /usr/local/bin/bun ]; then
            BUN_CMD=/usr/local/bin/bun
          elif command -v bun >/dev/null 2>&1; then
            BUN_CMD=bun
          else
            echo "Bun is required to install dependencies reproducibly because this repository uses bun.lock. Please install Bun on the Jenkins agent." >&2
            exit 1
          fi

          "$BUN_CMD" install --frozen-lockfile
        '''
      }
    }

    stage('Build') {
      steps {
        sh '''
          export NODE_OPTIONS=--max-old-space-size=1024
          if [ -x /usr/local/bin/bun ]; then
            /usr/local/bin/bun run build
          elif command -v bun >/dev/null 2>&1; then
            bun run build
          elif [ -x /usr/bin/npm ]; then
            /usr/bin/npm run build
          else
            npm run build
          fi
        '''
      }
    }

    stage('SonarQube Analysis') {
      when {
        expression { env.ENABLE_SONAR == 'true' }
      }
      steps {
        withSonarQubeEnv("${SONARQUBE_ENV}") {
          // ⚠️ Nécessite sonar-scanner installé sur les agents Jenkins
          // En PRODUCTION : utiliser tool 'SonarScanner' ou une image Docker pour l'isolation
          // En DEV/DÉMO : supposer que sonar-scanner est disponible dans PATH
          script {
            def sonarBranchArgs = ''
            if (env.CHANGE_ID) {
              // Pull Request
              sonarBranchArgs = " -Dsonar.pullrequest.key=${env.CHANGE_ID} -Dsonar.pullrequest.branch=${env.CHANGE_BRANCH} -Dsonar.pullrequest.base=${env.CHANGE_TARGET}"
            } else if (env.BRANCH_NAME && env.BRANCH_NAME != 'main') {
              // Feature branch
              sonarBranchArgs = " -Dsonar.branch.name=${env.BRANCH_NAME}"
            }
            // Main branch: no extra args needed
            sh """
              sonar-scanner \
                -Dsonar.projectKey=${SONAR_PROJECT_KEY} \
                -Dsonar.projectName=${SONAR_PROJECT_NAME} \
                -Dsonar.sources=src${sonarBranchArgs}
            """
          }
        }
      }
    }

    stage('Quality Gate') {
      when {
        expression { env.ENABLE_SONAR == 'true' }
      }
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          def branchName = env.BRANCH_NAME ?: ''
          def gitBranch = env.GIT_BRANCH ?: ''

          if (branchName == 'main' || gitBranch == 'origin/main') {
            env.IMAGE_TAG = 'latest'
          } else if (branchName == 'staging-aws-1' || gitBranch.endsWith('/staging-aws-1')) {
            env.IMAGE_TAG = 'staging-aws-1'
          } else {
            env.IMAGE_TAG = env.BUILD_NUMBER
          }
        }
        sh '''
          test -f .next/standalone/server.js || { echo "Missing .next/standalone/server.js" >&2; exit 1; }
          test -d .next/static || { echo "Missing .next/static" >&2; exit 1; }
        '''
        sh 'docker build -t ${DOCKER_IMAGE_NAME}:${IMAGE_TAG} .'
      }
    }

    stage('Docker Push') {
      when {
        expression {
          def branchName = env.BRANCH_NAME ?: ''
          def gitBranch = env.GIT_BRANCH ?: ''
          return branchName == 'main' || branchName == 'staging-aws-1' || gitBranch == 'origin/main' || gitBranch.endsWith('/staging-aws-1')
        }
      }
      steps {
        withCredentials([usernamePassword(credentialsId: "${DOCKER_CREDENTIALS_ID}", usernameVariable: 'DOCKERHUB_USERNAME', passwordVariable: 'DOCKERHUB_TOKEN')]) {
          sh '''
            FULL_IMAGE="${DOCKERHUB_USERNAME}/${DOCKER_IMAGE_NAME}:${IMAGE_TAG}"
            echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin
            docker tag ${DOCKER_IMAGE_NAME}:${IMAGE_TAG} "$FULL_IMAGE"
            docker push "$FULL_IMAGE"
            docker logout
          '''
        }
      }
    }

    stage('Deploy Staging AWS (Docs Only)') {
      when {
        expression {
          def branchName = env.BRANCH_NAME ?: ''
          def gitBranch = env.GIT_BRANCH ?: ''
          return branchName == 'staging-aws-1' || gitBranch.endsWith('/staging-aws-1')
        }
      }
      steps {
        withCredentials([
          usernamePassword(credentialsId: "${AWS_CREDENTIALS_ID}", usernameVariable: 'AWS_ACCESS_KEY_ID', passwordVariable: 'AWS_SECRET_ACCESS_KEY'),
          usernamePassword(credentialsId: "${DOCKER_CREDENTIALS_ID}", usernameVariable: 'DOCKERHUB_USERNAME', passwordVariable: 'DOCKERHUB_TOKEN')
        ]) {
          sh '''
            set -eu

            SSH_INGRESS_CIDR_EFFECTIVE="$(tr -d '\r\n' < "${WORKSPACE}/.ssh_ingress_cidr")"
            if [ -z "${SSH_INGRESS_CIDR_EFFECTIVE}" ]; then
              echo "Missing resolved SSH ingress CIDR in ${WORKSPACE}/.ssh_ingress_cidr" >&2
              exit 1
            fi

            rm -rf infra-workdir
            git clone --depth 1 --branch "${INFRA_REPO_BRANCH}" "${INFRA_REPO_URL}" infra-workdir

            TERRAFORM_DIR="infra-workdir/apps/docs-aws/terraform"
            ANSIBLE_DIR="infra-workdir/apps/docs-aws/ansible"
            if [ ! -d "${TERRAFORM_DIR}" ] || [ ! -d "${ANSIBLE_DIR}" ]; then
              echo "Missing expected docs-aws deploy directories in infra repository." >&2
              echo "Expected: ${TERRAFORM_DIR} and ${ANSIBLE_DIR}" >&2
              find infra-workdir -maxdepth 4 -type d | sed -n '1,80p' >&2
              exit 1
            fi

            PUBKEY_FILE="$(mktemp)"
            KNOWN_HOSTS_FILE="$(mktemp)"
            DEPLOY_SSH_KEY_FILE="${WORKER_DEPLOY_KEY_PATH}"
            TARGET_SSH_USER="${EC2_SSH_USER}"
            TF_KEY_NAME="${EC2_KEY_NAME}"
            ANSIBLE_EXTRA_VARS_FILE=""
            trap 'rm -f "${PUBKEY_FILE}" "${KNOWN_HOSTS_FILE}" "${ANSIBLE_EXTRA_VARS_FILE:-}"' EXIT

            if [ ! -f "${DEPLOY_SSH_KEY_FILE}" ]; then
              echo "Missing worker deploy key: ${DEPLOY_SSH_KEY_FILE}" >&2
              echo "Run bootstrap-worker.sh on jenkins-aws to install the key for user jenkins." >&2
              exit 1
            fi
            chmod 600 "${DEPLOY_SSH_KEY_FILE}" || true
            if ! ssh-keygen -y -f "${DEPLOY_SSH_KEY_FILE}" > "${PUBKEY_FILE}" 2>/dev/null; then
              echo "Invalid deploy key at ${DEPLOY_SSH_KEY_FILE}" >&2
              exit 1
            fi
            TF_PUBLIC_KEY="$(cat "${PUBKEY_FILE}")"
            if [ -z "${TF_PUBLIC_KEY}" ]; then
              echo "Derived public key is empty; aborting deploy." >&2
              exit 1
            fi
            echo "Using worker deploy key from ${DEPLOY_SSH_KEY_FILE}"

            cd "${TERRAFORM_DIR}"

            terraform init -input=false
            export TF_VAR_public_key="${TF_PUBLIC_KEY}"
            terraform apply -auto-approve -input=false \
              -var="aws_region=${AWS_REGION}" \
              -var="instance_name=${EC2_INSTANCE_NAME}" \
              -var="instance_type=${EC2_INSTANCE_TYPE}" \
              -var="ssh_ingress_cidr=${SSH_INGRESS_CIDR_EFFECTIVE}" \
              -var="public_key=${TF_PUBLIC_KEY}" \
              -var="key_name=${TF_KEY_NAME}"

            INSTANCE_IP=$(terraform output -raw docs_public_ip)
            if [ -z "${INSTANCE_IP:-}" ] || [ "${INSTANCE_IP}" = "None" ]; then
              echo "Impossible de recuperer l'IP publique depuis Terraform" >&2
              exit 1
            fi

            SSH_READY=false
            for _ in 1 2 3 4 5 6; do
              if ssh -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="${KNOWN_HOSTS_FILE}" -o ConnectTimeout=10 -i "${DEPLOY_SSH_KEY_FILE}" "${TARGET_SSH_USER}@${INSTANCE_IP}" 'echo ok' >/dev/null 2>&1; then
                SSH_READY=true
                break
              fi
              sleep 10
            done

            if [ "${SSH_READY}" != "true" ]; then
              echo "L'instance EC2 n'est pas accessible en SSH" >&2
              echo "Diagnostic quick check (forced user: ${TARGET_SSH_USER})" >&2
              ssh -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="${KNOWN_HOSTS_FILE}" -o ConnectTimeout=10 -vv -i "${DEPLOY_SSH_KEY_FILE}" "${TARGET_SSH_USER}@${INSTANCE_IP}" 'echo ok' 2>&1 | tail -n 40 >&2 || true
              exit 1
            fi

            cd "${WORKSPACE}/${ANSIBLE_DIR}"
            cat > inventory/hosts.yml <<EOF
all:
  children:
    docs:
      hosts:
        ${INSTANCE_IP}:
          ansible_user: "${TARGET_SSH_USER}"
          ansible_ssh_private_key_file: "${DEPLOY_SSH_KEY_FILE}"
          ansible_ssh_common_args: "-o StrictHostKeyChecking=no"
EOF

            umask 077
            ANSIBLE_EXTRA_VARS_FILE="$(mktemp)"
            cat > "${ANSIBLE_EXTRA_VARS_FILE}" <<EOF
docs_image: "${DOCKERHUB_USERNAME}/${DOCKER_IMAGE_NAME}:${IMAGE_TAG}"
docs_container_name: "dittopedia-docs"
docs_host_port: 80
dockerhub_username: "${DOCKERHUB_USERNAME}"
dockerhub_token: "${DOCKERHUB_TOKEN}"
EOF

            ansible-playbook -i inventory/hosts.yml site.yml \
              --extra-vars "@${ANSIBLE_EXTRA_VARS_FILE}"
          '''
        }
      }
    }
  }

  post {
    always {
      // Nettoyage des fichiers temporaires
      sh 'rm -f .ssh_ingress_cidr 2>/dev/null || true'
      
      // Déconnexion de Docker Hub pour la sécurité
      sh 'docker logout 2>/dev/null || true'
      
      // NETTOYAGE DISQUE : Supprime les images intermédiaires (dangling) 
      // qui n'ont plus de tag (souvent créées par le build précédent)
      sh 'docker image prune -f'
    }
    
    failure {
      // Optionnel : En cas d'échec, on peut faire un nettoyage plus profond
      // pour s'assurer que le prochain build démarre sur une base saine
      echo "Build failed, performing deep cleanup..."
      sh 'docker system prune -f --volumes'
    }
  }
}
