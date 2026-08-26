pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                echo 'Fetching source from GitHub'
                checkout scm
            }
        }
        stage('Verify') {
            steps {
                echo 'Checking that required files are present'
                sh 'test -f index.html'
                sh 'test -f app.js'
                sh 'test -f Dockerfile'
            }
        }
        stage('Build Docker image') {
            steps {
                echo 'Building the container image'
                sh 'docker build -t student-management .'
            }
        }
    }

    post {
        success {
            echo 'SUCCESS - build completed'
        }
        failure {
            echo 'FAILURE - check the console output above'
        }
    }
}
