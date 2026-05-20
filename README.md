# AWS API Gateway Assessment

## Overview

Small serverless API for an AWS assessment. Two endpoints, both protected by Cognito:

- `GET /weather?city={city}`: weather data from OpenWeatherMap
- `GET /country?name={country}`: country info from REST Countries

Weather Lambda is TypeScript, country Lambda is Python, everything else is CloudFormation.

## Architecture

```
Client -> API Gateway (Cognito authorizer) -> Lambda -> external API
```

Request comes in with a Cognito token in the `Authorization` header. API Gateway checks it, invokes the right Lambda, and the Lambda calls OpenWeatherMap or REST Countries and returns JSON.

## Technologies Used

- API Gateway, Lambda, Cognito, CloudFormation, IAM, S3
- TypeScript + Node.js for weather
- Python for country
- OpenWeatherMap API (needs a key)
- REST Countries API (no key)

## Deployment

You'll need AWS CLI configured, Node/npm installed, an OpenWeather API key, and an S3 bucket for the Lambda zip files (`YOUR_BUCKET_NAME`).

In production I'd put the OpenWeather key in Secrets Manager or SSM instead of passing it through CloudFormation. Kept it simple here for the assessment.

**1. Install and package the Lambdas**

```sh
npm install
npm run package
```

That gives you `dist/weather.zip` and `dist/country.zip`.

**2. Upload to S3**

```sh
aws s3 cp dist/weather.zip s3://YOUR_BUCKET_NAME/lambda1/weather.zip
aws s3 cp dist/country.zip s3://YOUR_BUCKET_NAME/lambda2/country.zip
```

**3. Deploy the stack**

```sh
aws cloudformation deploy \
  --template-file cloudformation/main.yaml \
  --stack-name scansource-api-stack \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    OpenWeatherApiKey=YOUR_OPENWEATHER_API_KEY \
    LambdaArtifactsBucket=YOUR_BUCKET_NAME
```

Grab the outputs when it's done:

```sh
aws cloudformation describe-stacks \
  --stack-name scansource-api-stack \
  --query "Stacks[0].Outputs"
```

You'll want `ApiBaseUrl`, `CognitoUserPoolId`, and `CognitoClientId`.

## Cognito Setup and Testing

Create a test user (swap in your user pool ID):

```sh
aws cognito-idp admin-create-user \
  --user-pool-id YOUR_USER_POOL_ID \
  --username testuser@example.com \
  --user-attributes Name=email,Value=testuser@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password \
  --user-pool-id YOUR_USER_POOL_ID \
  --username testuser@example.com \
  --password YourTestPassword123! \
  --permanent
```

Get a token:

```sh
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id YOUR_CLIENT_ID \
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=YourTestPassword123!
```

Copy the `IdToken` from the response and use it as your auth header:

```sh
export ID_TOKEN=YOUR_ID_TOKEN
```

## curl Examples

Use your `ApiBaseUrl` output for `YOUR_API_BASE_URL` (something like `https://abc123.execute-api.us-east-1.amazonaws.com/dev`).

No token, should get 401:

```sh
curl -i "YOUR_API_BASE_URL/weather?city=Greenville"
```

Weather:

```sh
curl -i -H "Authorization: ${ID_TOKEN}" "YOUR_API_BASE_URL/weather?city=Greenville"
```

Country:

```sh
curl -i -H "Authorization: ${ID_TOKEN}" "YOUR_API_BASE_URL/country?name=Brazil"
```

Missing query param:

```sh
curl -i -H "Authorization: ${ID_TOKEN}" "YOUR_API_BASE_URL/weather"
```

Example weather response:

```json
{
  "city": "Greenville",
  "country": "US",
  "temperature": 18.5,
  "feelsLike": 17.9,
  "description": "clear sky",
  "humidity": 55,
  "windSpeed": 2.1
}
```

Example country response:

```json
{
  "name": "Brazil",
  "officialName": "Federative Republic of Brazil",
  "capital": "Brasília",
  "region": "Americas",
  "population": 212559409,
  "currencies": ["Brazilian real (R$)"],
  "languages": ["Portuguese"],
  "flag": "https://flagcdn.com/w320/br.png"
}
```

Missing `city` returns something like:

```json
{ "error": "Missing required query parameter: city" }
```

## Cleanup

```sh
aws cloudformation delete-stack --stack-name scansource-api-stack
```

Optional: remove the zip files from S3:

```sh
aws s3 rm s3://YOUR_BUCKET_NAME/lambda1/weather.zip
aws s3 rm s3://YOUR_BUCKET_NAME/lambda2/country.zip
```

## Assumptions and Limitations

- Both endpoints require Cognito auth
- Lambda code comes from S3, so you have to build/upload zips before deploy (or redeploy after code changes)
- Weather Lambda needs TypeScript compiled before packaging
- OpenWeather key goes through CloudFormation here. Not how I'd do it in prod.
- Lambdas return CORS headers but there are no OPTIONS methods on API Gateway
- Example response values will vary depending on the live API data
