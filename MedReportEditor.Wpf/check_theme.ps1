$asm = [System.Reflection.Assembly]::LoadFrom('D:\Lavoro\Sviluppo\MedicalReportingAPP\MedReportAndSign\MedReportAndSign\MedReportEditor.Wpf\bin\Debug\net8.0-windows\Telerik.Windows.Themes.Fluent.dll')
$stream = $asm.GetManifestResourceStream('Telerik.Windows.Themes.Fluent.g.resources')
$reader = [System.Resources.ResourceReader]::new($stream)
$enumerator = $reader.GetEnumerator()
while ($enumerator.MoveNext()) {
  Write-Output $enumerator.Key
}
$reader.Close()
