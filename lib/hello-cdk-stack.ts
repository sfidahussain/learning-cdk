import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from "@aws-cdk/aws-ecs";
import * as apigatewayintegration from '@aws-cdk/aws-apigatewayv2-integrations';
import * as ecr from '@aws-cdk/aws-ecr';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as apigateway from '@aws-cdk/aws-apigatewayv2';
import {HttpMethod} from '@aws-cdk/aws-apigatewayv2';

export class HelloCdkStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
      const vpc = new ec2.Vpc(this, "MyVpc", {
          maxAzs: 2 // Default is all AZs in region
      });

      const cluster = new ecs.Cluster(this, "MyCluster", {
          vpc: vpc
      });

    // Create ALB
    const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc,
      // internetFacing: true,
      // vpcSubnets: vpc.selectSubnets({
      //   subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      // })
    });

    const listener = lb.addListener('PublicListener', { port: 80 });

    const feTargetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroupFE', {
      port: 80,
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        port: '80',
        protocol: elbv2.Protocol.HTTP
      }
    });

    listener.addTargetGroups("alb-listener-target-group", {
      targetGroups: [feTargetGroup],
    });

    // ECR repository
    const repository_be = ecr.Repository.fromRepositoryName(this, 'hello-be', 'hello-be');

    // Create Task Definition for FE
    const feTaskDefinition = new ecs.FargateTaskDefinition(this, 'feTaskDefinition');
    const feContainer = feTaskDefinition.addContainer('web', {
      // @ts-ignore
      image: ecs.ContainerImage.fromEcrRepository(repository_be),
      memoryLimitMiB: 256,
    });

    feContainer.addPortMappings({
      containerPort: 80,
    });

// Create Service for FE
    const feService = new ecs.FargateService(this, "feService", {
      cluster,
      taskDefinition: feTaskDefinition,
    });

// add to a target group so make containers discoverable by the application load balancer
    feService.attachToApplicationTargetGroup(feTargetGroup);

    new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: lb.loadBalancerDnsName, });
    const api = new apigateway.HttpApi(this, 'httpApi', {
      apiName: 'httpApi'
    });

    // @ts-ignore
    const vpcLink = new apigateway.VpcLink(this, 'VpcLink', { vpc });

    // @ts-ignore

    const integration = new apigatewayintegration.HttpAlbIntegration('Integration', listener, {
      vpcLink,
      method: HttpMethod.ANY,
    });

    // 👇 add route for GET /todos
    api.addRoutes({
      path: '/{proxy+}',
      methods: [apigateway.HttpMethod.ANY],
      integration: integration,
    });

    // 👇 add an Output with the API Url
    new cdk.CfnOutput(this, 'apiUrl', {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      value: api.url!,
    });
    // This is for integrating an API Gateway to a public load balancer with a dns name
    // https://aws.amazon.com/premiumsupport/knowledge-center/api-gateway-application-load-balancers/
    // If we are trying to integrate an API gateway with a private ALB , you'll need a network load balancer in between
    // Route53 to API Gateway

  }
}