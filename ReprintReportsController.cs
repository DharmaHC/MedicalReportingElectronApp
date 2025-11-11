using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MedicalReportingAPI.Data;
using MedicalReportingAPI.Models;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace MedicalReportingAPI.Controllers
{
    [ApiController]
    [Route("api/reports")]
    public class ReprintReportsController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public class ReprintReportsController(ApplicationDbContext context)
        {
            _context = context;
        }

        /// <summary>
        /// Search for signed reports by ExternalAccessionNumber and ExternalPatientId
        /// </summary>
        /// <param name="externalAccessionNumber">External accession number from ExaminationsAndConsultations</param>
        /// <param name="externalPatientId">External patient ID from Patients</param>
        /// <returns>List of found reports</returns>
        [HttpGet("search")]
        public async Task<IActionResult> SearchReports(
            [FromQuery] string externalAccessionNumber,
            [FromQuery] string externalPatientId)
        {
            if (string.IsNullOrEmpty(externalAccessionNumber) || string.IsNullOrEmpty(externalPatientId))
            {
                return BadRequest(new { error = "Both externalAccessionNumber and externalPatientId are required" });
            }

            try
            {
                var reports = await _context.DigitalSignedReports
                    .Where(dsr => dsr.Examination.ExternalAccessionNumber == externalAccessionNumber &&
                                  dsr.Examination.Patient.ExternalPatientId == externalPatientId &&
                                  dsr.Pdf != null)
                    .OrderByDescending(dsr => dsr.PrintDate)
                    .Select(dsr => new
                    {
                        id = dsr.Id,
                        patientName = dsr.Examination.Patient.FirstName + " " + dsr.Examination.Patient.LastName,
                        externalAccessionNumber = dsr.Examination.ExternalAccessionNumber,
                        externalPatientId = dsr.Examination.Patient.ExternalPatientId,
                        signedDate = dsr.PrintDate,
                        pdfSize = dsr.Pdf.Length
                    })
                    .ToListAsync();

                if (!reports.Any())
                {
                    return NotFound(new { error = "No reports found" });
                }

                return Ok(reports);
            }
            catch (Exception ex)
            {
                // Log the error (you can inject ILogger here)
                return StatusCode(500, new { error = "Internal server error", details = ex.Message });
            }
        }

        /// <summary>
        /// Get PDF file for a specific report by ID
        /// </summary>
        /// <param name="id">Report GUID</param>
        /// <returns>PDF file</returns>
        [HttpGet("{id}/pdf")]
        public async Task<IActionResult> GetReportPdf(Guid id)
        {
            try
            {
                var report = await _context.DigitalSignedReports
                    .Where(dsr => dsr.Id == id)
                    .Select(dsr => new
                    {
                        pdf = dsr.Pdf,
                        patientName = dsr.Examination.Patient.FirstName + " " + dsr.Examination.Patient.LastName,
                        accessionNumber = dsr.Examination.ExternalAccessionNumber
                    })
                    .FirstOrDefaultAsync();

                if (report == null)
                {
                    return NotFound(new { error = "Report not found" });
                }

                if (report.pdf == null || report.pdf.Length == 0)
                {
                    return NotFound(new { error = "PDF data not found" });
                }

                var fileName = $"Referto_{report.patientName}_{report.accessionNumber}.pdf";

                return File(report.pdf, "application/pdf", fileName);
            }
            catch (Exception ex)
            {
                // Log the error (you can inject ILogger here)
                return StatusCode(500, new { error = "Internal server error", details = ex.Message });
            }
        }
    }
}
