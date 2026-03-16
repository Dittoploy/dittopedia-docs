pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    DOCKER_IMAGE = 'dittoploy/dittopedia-docs'
    DOCKER_CREDENTIALS_ID = 'dockerhub-creds'
    SONARQUBE_ENV = 'sonarqube'
    SONAR_PROJECT_KEY = 'dittopedia-docs'
    SONAR_PROJECT_NAME = 'dittopedia-docs'
  }

  stages {
    stage('Install') {
      steps {
        sh 'bun install --frozen-lockfile'
      }
    }

    stage('Build') {
      steps {
        sh 'npm run build'
      }
    }

    stage('SonarQube Analysis') {
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
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          env.IMAGE_TAG = env.BRANCH_NAME == 'main' ? 'latest' : env.BUILD_NUMBER
        }
        sh 'docker build -t ${DOCKER_IMAGE}:${IMAGE_TAG} .'
      }
    }

    stage('Docker Push') {
      when {
        branch 'main'
      }
      steps {
        withCredentials([usernamePassword(credentialsId: "${DOCKER_CREDENTIALS_ID}", usernameVariable: 'DOCKERHUB_USERNAME', passwordVariable: 'DOCKERHUB_TOKEN')]) {
          sh '''
            echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin
            docker push ${DOCKER_IMAGE}:latest
            docker logout
          '''
        }
      }
    }
  }
}
