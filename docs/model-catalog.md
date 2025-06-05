# Model Catalog Feature Documentation

## Overview

The Model Catalog feature provides access to pre-trained models from various sources, with a primary focus on Red Hat's curated model collection. It serves as a bridge between model providers and users, allowing easy discovery and deployment of models.

## Current Implementation

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

## Integration with Model Registry

The Model Catalog integrates with the Model Registry in several ways:

1. **Model Registration**:

   - Models can be registered from the catalog to the Model Registry
   - When registering, the following information is copied:
     - Model name and description
     - Model format and version
     - Model URI
     - Source tracking properties
     - Custom properties including:
       - License information
       - Provider details
       - Source model name and version

2. **Source Tracking**:
   - Registered models maintain a link to their catalog source
   - This allows tracing back to the original model in the catalog
   - Enables version tracking and updates

## Integration with Model Serving

The Model Catalog provides direct deployment capabilities:

1. **Deployment Flow**:

   - Models can be deployed directly from the catalog
   - Reuses the Model Registry's deployment form
   - Pre-fills model location information
   - Skips connection selection for registry.redhat.io models

2. **Authentication Handling**:
   - Models from registry.redhat.io use built-in cluster credentials
   - No additional connection configuration required
   - Simplifies the deployment process for Red Hat models

## Notable Implementation Details

1. **Source Management**:

   - The ConfigMap structure is complex and requires careful parsing
   - Source validation is critical for maintaining catalog integrity
   - Future API will simplify this complexity

2. **Model URI Handling**:

   - Different URI formats for different sources
   - Special handling for registry.redhat.io URIs
   - URI validation and transformation logic

3. **Deployment Integration**:
   - Reuses Model Registry deployment logic
   - Custom handling for catalog-specific deployment flows
   - Authentication abstraction for different sources

## Future Considerations

1. **API Migration**:

   - Migration to new Model Catalog API
   - Enhanced filtering and sorting capabilities
   - Improved source management
   - Better integration with Model Registry and Model Serving

2. **Source Management**:

   - Simplified source configuration
   - Better validation and error handling
   - More flexible source addition process

3. **Deployment Flow**:
   - Streamlined deployment process
   - Better error handling and user feedback
   - Enhanced authentication options
