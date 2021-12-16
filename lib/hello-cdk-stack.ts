import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from "@aws-cdk/aws-ecs";
import * as ecs_patterns from "@aws-cdk/aws-ecs-patterns";
import * as ecr from '@aws-cdk/aws-ecr';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as path from "path";

export class HelloCdkStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
      const vpc = new ec2.Vpc(this, "MyVpc", {
          maxAzs: 3 // Default is all AZs in region
      });

      const cluster = new ecs.Cluster(this, "MyCluster", {
          vpc: vpc
      });

      // ECR repository
      const repository_be = ecr.Repository.fromRepositoryName(this, 'hello-be', 'hello-be');

    const repository_fe = ecr.Repository.fromRepositoryName(this, 'hello-fe', 'hello-fe');

    // Create Task Definition for BE
    const beTaskDefinition = new ecs.FargateTaskDefinition(this, 'beTaskDefinition');
    const beContainer = beTaskDefinition.addContainer('web', {
      // @ts-ignore
      image: ecs.ContainerImage.fromEcrRepository(repository_be),
      memoryLimitMiB: 256,
    });

    beContainer.addPortMappings({
      containerPort: 8080,
    });

// Create Service for BE
    const beService = new ecs.FargateService(this, "beService", {
      cluster,
      taskDefinition: beTaskDefinition,
    });

    // Create Task Definition for FE
    const feTaskDefinition = new ecs.FargateTaskDefinition(this, 'feTaskDefinition');
    const feContainer = feTaskDefinition.addContainer('web', {
      // @ts-ignore
      image: ecs.ContainerImage.fromEcrRepository(repository_fe),
      memoryLimitMiB: 256,
    });

    feContainer.addPortMappings({
      containerPort: 8080,
    });

// Create Service for FE
    const feService = new ecs.FargateService(this, "feService", {
      cluster,
      taskDefinition: feTaskDefinition,
    });

// Create ALB
    const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc,
      internetFacing: true
    });
    const listener = lb.addListener('PublicListener', { port: 8080, open: true });

    const beTargetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroupBE', {
      port: 80,
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/actuator/health',
        port: '8080',
        protocol: elbv2.Protocol.HTTP
      }
    });

    const feTargetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroupFE', {
      port: 80,
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/home/actuator/health',
        port: '8080',
        protocol: elbv2.Protocol.HTTP
      }
    });


    new elbv2.ApplicationListenerRule(this, 'MyApplicationListenerBeRule', {
      listener: listener,
      priority: 123,
      pathPatterns: ['/api', '/api/*'],
      targetGroups: [beTargetGroup],
    });

    new elbv2.ApplicationListenerRule(this, 'MyApplicationListenerFeRule', {
      listener: listener,
      priority: 1,
      pathPatterns: ['/home'],
      targetGroups: [feTargetGroup],
    });

    listener.addTargetGroups("alb-listener-target-group", {
      targetGroups: [feTargetGroup],
    });

// add to a target group so make containers discoverable by the application load balancer
    feService.attachToApplicationTargetGroup(feTargetGroup);
    beService.attachToApplicationTargetGroup(beTargetGroup);

    new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: lb.loadBalancerDnsName, });

    // This is for integrating an API Gateway to a public load balancer with a dns name
    // https://aws.amazon.com/premiumsupport/knowledge-center/api-gateway-application-load-balancers/
    // If we are trying to integrate an API gateway with a private ALB , you'll need a network load balancer in between
    // Route53 to API Gateway

  }
}