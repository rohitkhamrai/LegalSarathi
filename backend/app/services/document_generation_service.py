"""
Document Generation Service
Uses Jinja2 to render legal document templates with user data.
Supports English templates for:
- RTI Applications
- Consumer Complaints  
- Tenant Defense
- POSH Complaints
"""

from jinja2 import Environment, FileSystemLoader, TemplateNotFound
from pathlib import Path
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class DocumentGenerationService:
    """Service to generate legal documents from Jinja2 templates."""
    
    def __init__(self):
        """Initialize Jinja2 environment with template loader."""
        template_dir = Path(__file__).parent.parent / "templates"
        
        if not template_dir.exists():
            logger.error(f"Template directory not found: {template_dir}")
            raise FileNotFoundError(f"Templates directory not found at {template_dir}")
        
        self.env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=True,
            trim_blocks=True,
            lstrip_blocks=True
        )
        self.template_dir = template_dir
        logger.info(f"DocumentGenerationService initialized with template dir: {template_dir}")
    
    def get_available_templates(self) -> Dict[str, list]:
        """
        List all available document types and their language variants.
        
        Returns:
            Dict mapping document types to list of available languages
            Example: {"rti_application": ["english"], "consumer_complaint": ["english"]}
        """
        available = {}
        
        try:
            # Scan template directories
            for doc_dir in self.template_dir.iterdir():
                if doc_dir.is_dir() and not doc_dir.name.startswith('_'):
                    templates = [f.stem for f in doc_dir.glob('*.jinja2')]
                    if templates:
                        available[doc_dir.name] = sorted(templates)
            
            logger.info(f"Available templates: {available}")
            return available
        except Exception as e:
            logger.error(f"Error scanning templates: {str(e)}")
            return {}
    
    def render_document(
        self, 
        doc_type: str, 
        language: str = "english",
        data: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Render a document template with the provided data.
        
        Args:
            doc_type: Type of document (e.g., 'rti_application', 'consumer_complaint')
            language: Language of template (default: 'english')
            data: Dictionary of template variables
            
        Returns:
            Rendered HTML document as string
            
        Raises:
            TemplateNotFound: If template file doesn't exist
            ValueError: If required template variables are missing
        """
        if data is None:
            data = {}
        
        try:
            # Construct template path: doc_type/language.jinja2
            template_path = f"{doc_type}/{language}.jinja2"
            logger.info(f"Loading template: {template_path}")
            
            template = self.env.get_template(template_path)
            
            # Render the template with provided data
            html_content = template.render(**data)
            
            logger.info(f"Document rendered successfully: {doc_type}/{language}")
            return html_content
            
        except TemplateNotFound as e:
            logger.error(f"Template not found: {doc_type}/{language}")
            available = self.get_available_templates()
            raise TemplateNotFound(
                f"Template '{language}' not found for document type '{doc_type}'. "
                f"Available types: {list(available.keys())}"
            )
        except Exception as e:
            logger.error(f"Error rendering document: {str(e)}")
            raise ValueError(f"Error rendering document: {str(e)}")
    
    def validate_document_type(self, doc_type: str) -> bool:
        """
        Check if a document type exists.
        
        Args:
            doc_type: Document type to check
            
        Returns:
            True if document type exists, False otherwise
        """
        available = self.get_available_templates()
        return doc_type in available
    
    def validate_language(self, doc_type: str, language: str) -> bool:
        """
        Check if a language variant exists for a document type.
        
        Args:
            doc_type: Document type
            language: Language to check
            
        Returns:
            True if language variant exists, False otherwise
        """
        available = self.get_available_templates()
        if doc_type not in available:
            return False
        return language in available[doc_type]
    
    def get_required_fields(self, doc_type: str, language: str = "english") -> Dict[str, str]:
        """
        Get required template variables for a document type.
        
        Args:
            doc_type: Document type
            language: Language variant
            
        Returns:
            Dictionary of field names and descriptions
        """
        # Field mappings for each document type
        field_mappings = {
            "rti_application": {
                "applicant_name": "Full name of the applicant",
                "applicant_address": "Residential address",
                "applicant_phone": "Contact phone number (10 digits)",
                "applicant_email": "Email address",
                "public_authority": "Name of the public authority",
                "information_sought": "Specific information being requested (detailed)",
                "preferred_mode": "Mode of information delivery (Online/Physical/Email)",
                "date_of_application": "Date of application (DD-MM-YYYY format)"
            },
            "consumer_complaint": {
                "complainant_name": "Full name of complainant",
                "complainant_address": "Address of complainant",
                "complainant_phone": "Phone number of complainant",
                "complainant_email": "Email address of complainant",
                "seller_name": "Name of seller/service provider",
                "seller_address": "Address of seller",
                "seller_phone": "Phone of seller",
                "product_service": "Description of product/service purchased",
                "purchase_date": "Date of purchase (DD-MM-YYYY format)",
                "amount_paid": "Amount paid (numeric value in rupees)",
                "complaint_description": "Detailed description of complaint/issue",
                "relief_sought": "What relief/compensation is being sought",
                "complaint_date": "Date of complaint (DD-MM-YYYY format)"
            },
            "tenant_defense": {
                "landlord_name": "Name of landlord/plaintiff",
                "tenant_name": "Name of tenant/respondent",
                "case_number": "Court case number (if available)",
                "property_address": "Full address of property",
                "property_type": "Type of property (Residential/Commercial)",
                "rent_amount": "Monthly rent amount (numeric)",
                "tenancy_start_date": "Date tenancy started (DD-MM-YYYY)",
                "notice_period_days": "Number of days notice given",
                "date_of_statement": "Date of statement (DD-MM-YYYY)"
            },
            "posh_complaint": {
                "complaint_date": "Date of complaint (DD-MM-YYYY)",
                "company_name": "Name of company/organization",
                "complainant_name": "Name of person filing complaint",
                "designation": "Job designation of complainant",
                "department": "Department name",
                "employee_id": "Employee ID number",
                "contact_no": "Contact number of complainant",
                "respondent_name": "Name of person accused",
                "respondent_designation": "Designation of respondent",
                "respondent_department": "Department of respondent",
                "incident_date": "Date of incident (DD-MM-YYYY)",
                "incident_time": "Time of incident (HH:MM format)",
                "incident_location": "Location/place of incident",
                "incident_description": "Detailed description of harassment incident",
                "witnesses": "Names of witnesses (if any)",
                "work_impact": "Impact on work performance/productivity",
                "emotional_impact": "Emotional/psychological impact on complainant"
            }
        }
        
        return field_mappings.get(doc_type, {})
    
    def get_document_info(self, doc_type: str) -> Dict[str, Any]:
        """
        Get information about a specific document type.
        
        Args:
            doc_type: Document type
            
        Returns:
            Dictionary with document info (description, act reference, etc.)
        """
        info_mapping = {
            "rti_application": {
                "title": "Right to Information Application",
                "description": "Application to request information from public authorities",
                "act": "Right to Information Act, 2005",
                "application_fee": "₹10"
            },
            "consumer_complaint": {
                "title": "Consumer Complaint",
                "description": "Complaint regarding defective product or poor service",
                "act": "Consumer Protection Act, 2019",
                "application_fee": "Variable based on claim amount"
            },
            "tenant_defense": {
                "title": "Tenant Defense Statement",
                "description": "Written statement in defense of eviction petition",
                "act": "Residential Tenancy Act (State specific)",
                "application_fee": "Court fees as applicable"
            },
            "posh_complaint": {
                "title": "Sexual Harassment Complaint",
                "description": "Formal complaint of sexual harassment at workplace",
                "act": "Sexual Harassment of Women at Workplace Act, 2013",
                "application_fee": "Free - mandatory for employers to receive"
            }
        }
        
        return info_mapping.get(doc_type, {
            "title": doc_type.replace('_', ' ').title(),
            "description": "Legal document",
            "act": "Indian Law",
            "application_fee": "Check with applicable authority"
        })
