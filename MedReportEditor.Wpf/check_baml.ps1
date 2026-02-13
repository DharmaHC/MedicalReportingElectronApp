$asm = [System.Reflection.Assembly]::LoadFrom('D:\Lavoro\Sviluppo\MedicalReportingAPP\MedReportAndSign\MedReportAndSign\MedReportEditor.Wpf\bin\Debug\net8.0-windows\Telerik.Windows.Controls.RichTextBox.dll')
$stream = $asm.GetManifestResourceStream('Telerik.Windows.Controls.RichTextBox.g.resources')
$reader = [System.Resources.ResourceReader]::new($stream)
$enumerator = $reader.GetEnumerator()
while ($enumerator.MoveNext()) {
  if ($enumerator.Key -match 'generic|theme') {
    Write-Output $enumerator.Key
  }
}
$reader.Close()
