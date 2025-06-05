# Model Registry Feature Documentation

## Overview

The Model Registry feature provides a way to register, version, and manage machine learning models in the ODH Dashboard. It consists of several key components that work together to provide a complete model management solution.

## Model Registry Configuration

### 1. ModelRegistry Custom Resource

The ModelRegistry is a Kubernetes custom resource that defines the configuration for a model registry instance. When created, the model registry operator deploys the service and exposes the API for interacting with the registry. The ModelRegistry CR spec includes:

- Database configuration:
  - Host
  - Port
  - Database name
  - Username
  - Password (stored in a Secret)
  - Optional: TLS certificate for secure database connection
- Service configuration:
  - External address for API access
  - Resource limits and requests
  - Replicas

> **Note**: The Model Registry does not manage the creation of the database. Users must provide their own deployed MySQL database instance.

### 2. Settings Page

The Model Registry settings page in the dashboard provides a UI for managing ModelRegistry instances. The page allows users to:

- Create new ModelRegistry instances
- View existing instances
- Edit instance configurations
- Delete instances
- Manage permissions through role bindings

### 3. Security and Access Management

#### Database Security

The database connection is secured through:

1. A Secret containing the database password, which is:

   - Created alongside the ModelRegistry CR
   - Only accessible to the backend service
   - Never exposed to the frontend

2. Optional TLS certificate for database connection:
   - Can be provided via Secret or ConfigMap
   - Used to establish secure database connections
   - Managed separately from the password Secret

#### Permission Management

Model Registry permissions are managed through Kubernetes RoleBindings, which:

- Control access to ModelRegistry instances
- Define who can create, read, update, and delete models
- Are managed through the dashboard's backend service account

### 4. Implementation Details

#### Current Implementation (Deprecated)

The current implementation uses the dashboard's service account to:

1. Create and manage ModelRegistry CRs
2. Create and manage associated Secrets
3. Manage RoleBindings for permissions

This approach was chosen to circumvent RBAC issues, but it is considered deprecated.

#### Future Implementation

The current implementation will be replaced with the passthrough API, which will:

- Provide a more secure and maintainable approach
- Better align with Kubernetes best practices
- Remove the need for the dashboard service account to manage these resources

## Model Catalog Integration

### 1. Overview

The Model Catalog feature provides access to pre-trained models from various sources, with a primary focus on Red Hat's curated model collection. It serves as a bridge between model providers and users, allowing easy discovery and deployment of models.

### 2. Current Implementation

The Model Catalog currently uses ConfigMaps to manage model sources:

1. **Managed ConfigMap**:

   - Contains Red Hat's curated model collection
   - Automatically updated with new models
   - Managed by the platform

2. **Unmanaged ConfigMap**:
   - Allows users to add their own model sources
   - Customizable by cluster administrators
   - Persists across platform updates

> **Note**: This ConfigMap-based implementation is temporary. For more details about the current implementation, see the [Model Catalog documentation](https://github.com/opendatahub-io/model-registry/tree/main/model-catalog). It will be replaced with a new Model Catalog API that will provide enhanced sorting and filtering capabilities while abstracting away the source management details.

### 3. Integration with Model Registry

The Model Catalog integrates with the Model Registry in several ways:

1. **Model Registration**:

   - Models can be registered from the catalog to the Model Registry
   - When registering, the following information is copied:
     - Model name and description
     - Model format and version
     - Model URI
     - Source tracking properties (see [Source Tracking](#4-integration-with-other-features))
     - Custom properties including:
       - License information
       - Provider details
       - Source model name and version

2. **Source Tracking**:
   - Registered models maintain a link to their catalog source
   - This allows tracing back to the original model in the catalog
   - Enables version tracking and updates

### 4. Integration with Other Features

The Model Registry integrates with several other features:

- Model Serving: Models can be deployed for serving
- Model Catalog: Models can be registered from the catalog (see [Model Catalog Documentation](model-catalog.md) for details)
- Pipelines: Models can be registered from pipeline runs

When a model is registered from one of these sources, we track the source information using special properties on the ModelArtifact:

- `modelSourceKind`: Indicates the type of source (CATALOG or KFP for pipeline runs)
- `modelSourceClass`: For catalog sources, identifies the source system
- `modelSourceGroup`: For catalog sources, identifies the repository; for pipeline runs, identifies the project
- `modelSourceName`: A human-readable name for the source
- `modelSourceId`: For catalog sources, identifies the tag; for pipeline runs, identifies the run ID

This source tracking allows us to:

- Display links back to the original source in the UI
- Show the registration history of a model
- Maintain traceability between models and their origins
- Support different registration workflows from various parts of the application

For example, when a model is registered from a pipeline run, we can show a link back to that specific run, allowing users to trace the model's lineage back to its training process.

## Core Components

### 1. Data Models

These objects are stored in a SQL database abstracted by the Model Registry REST API. The relationship is 1 RegisteredModel : many ModelVersions : many ModelArtifacts (\* see caveat in [ModelArtifact Abstraction](#1-modelartifact-abstraction) below.).

#### RegisteredModel

- Represents a registered model in the system
- Contains metadata about the model such as name, description, and state
- Acts as a logical container for ModelVersions

#### ModelVersion

- Represents a specific version of a registered model
- Contains version-specific metadata
- Acts as a logical container for ModelArtifacts
- Has a state (LIVE, ARCHIVED)
- References its parent model with `registeredModelId`

#### ModelArtifact

- Represents the actual model artifact (the model file/data)
- Contains information about:
  - Model format and version
  - Storage location (URI)
  - State (LIVE, ARCHIVED)
  - Author
  - Custom properties
- References its parent version with `modelVersionId`

### 2. API Integration via Service Proxy

The Model Registry feature integrates with the Model Registry API service through a proxy mechanism. The proxy service is configured in [backend/src/routes/api/service/modelregistry/index.ts](https://github.com/opendatahub-io/odh-dashboard/blob/main/backend/src/routes/api/service/modelregistry/index.ts).

The proxy service uses the `routing.opendatahub.io/external-address-rest` annotation on a registry's associated k8s Service to determine the external address of the Model Registry API. This was initially a requirement for Service Mesh support, but it is no longer a strict requirement of the backend since Service Mesh is no longer required. This mechanism remains and still works without Service Mesh, and we keep it implemented this way in the dashboard to support a corner case where a user might want to enable Service Mesh even though it is not required.

When running the backend locally for development, this external annotation will not work, so we require port-forwarding directly to the service. This only works if Service Mesh is not being used, which is the default configuration.

### 3. Key API Operations

The frontend provides several API operations through the `ModelRegistryAPIs` interface:

- Model Registration:

  - `createRegisteredModel`
  - `createModelVersion`
  - `createModelVersionForRegisteredModel`
  - `createModelArtifact`
  - `createModelArtifactForModelVersion`

- Model Retrieval:

  - `getRegisteredModel`
  - `getModelVersion`
  - `getModelArtifact`
  - `listModelArtifacts`
  - `listModelVersions`
  - `listRegisteredModels`

- Model Updates:
  - `patchRegisteredModel`
  - `patchModelVersion`
  - `patchModelArtifact`

## Notable Implementation Details

### 1. ModelArtifact Abstraction

One notable and potentially confusing aspect of the implementation is how ModelArtifact objects are abstracted away in the UI. The ModelVersionDetailsView component treats ModelArtifact properties as if they were part of the ModelVersion object:

```typescript
const ModelVersionDetailsView: React.FC<ModelVersionDetailsViewProps> = ({
  modelVersion: mv,
  isArchiveVersion,
  refresh,
}) => {
  const [modelArtifacts, modelArtifactsLoaded, modelArtifactsLoadError, refreshModelArtifacts] =
    useModelArtifactsByVersionId(mv.id);
  const modelArtifact = modelArtifacts.items.length ? modelArtifacts.items[0] : null;
  // ... modelArtifact properties are used directly in the view
```

This abstraction means that:

- The UI presents a unified view of model version data
- Model artifact properties are treated as first-class properties of the version
- The relationship between versions and artifacts is hidden from the user

This design choice, while simplifying the user experience, can lead to confusion when:

- Debugging issues that span both version and artifact properties
- Understanding the underlying data model
- Implementing new features that need to distinguish between version and artifact properties
- Maintaining code that assumes this abstraction

> **Note on Future Artifact Management**: While the current implementation assumes a single artifact per version, the API is designed to potentially support multiple artifacts per version in the future. However, for the foreseeable future we will maintain the assumption of a 1:1 relationship between ModelVersion and ModelArtifact and we have confirmed that it is acceptable to propagate that assumption when adding future functionality.

### 2. State Management

The feature implements a state management system for both ModelVersion and ModelArtifact objects:

- States include: LIVE, ARCHIVED
- State changes trigger UI updates and navigation changes
- Archived versions are shown in separate views

### 3. Model Location Handling

The system supports different types of model storage locations:

- Object Storage (S3-compatible)
- Direct URIs
- Custom storage configurations

The location information is stored in the ModelArtifact's URI field and can be parsed into its components:

```typescript
const storageFields = uriToModelLocation(modelArtifact?.uri || '');
```

## API Endpoints

The Model Registry API is accessed through the following endpoints:

- `/api/model_registry/v1alpha3/registered_models`
- `/api/model_registry/v1alpha3/model_versions`
- `/api/model_registry/v1alpha3/model_artifacts`

Each endpoint supports standard CRUD operations and includes specific endpoints for relationships between these objects.

## Error Handling

The system includes a custom error handling mechanism through `handleModelRegistryFailures` that wraps API calls and provides consistent error handling across the feature.

## Future Considerations

1. The current implementation assumes a single artifact per version, which might need to be revisited if multiple artifacts per version are needed.

2. The URI parsing and storage location handling could be made more robust and extensible.

3. The state management system could be simplified to reduce complexity in state synchronization.

4. The abstraction of ModelArtifact properties into ModelVersion could be made more explicit in the codebase.
